// opus-fixture-test.mjs — focused G0.2 regression coverage.
// Runs the complete validator, then directly invokes hidden checks for two tasks without importing validator logic.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATE = path.join(REPO, 'eval', 'opus-fixture', 'validate.mjs');
const ORACLE_ROOT = path.join(REPO, 'eval', 'opus-fixture', '_oracle');
const CHECK_TIMEOUT_MS = 10_000;
let ok = 0;
let n = 0;

function t(condition, message) {
  n++;
  if (condition) {
    ok++;
    console.log('PASS:', message);
  } else {
    console.log('FAIL:', message);
  }
}

function run(script, solutionDir) {
  return spawnSync(process.execPath, [script, solutionDir], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
  });
}

function cleanExit(runResult) {
  return !runResult.error && !runResult.signal && runResult.status === 0;
}

function intentionalFailure(runResult) {
  return !runResult.error
    && !runResult.signal
    && Number.isInteger(runResult.status)
    && runResult.status !== 0;
}

const validation = spawnSync(process.execPath, [VALIDATE], {
  cwd: REPO,
  encoding: 'utf8',
  timeout: 60_000,
});
t(
  cleanExit(validation),
  `complete fixture validator exits 0${cleanExit(validation) ? '' : ` (${validation.stderr.trim() || validation.stdout.trim()})`}`,
);
t(
  /HIDDENNESS SEEDED-LEAK NEGATIVE: FAIL observed as required/.test(validation.stdout),
  'validator proves the hiddenness rule rejects a seeded leak',
);
t(
  /FIXTURE SHA-256: [a-f0-9]{64}/.test(validation.stdout),
  'validator prints the frozen fixture SHA-256',
);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pack = spawnSync(npmCommand, ['pack', '--dry-run', '--json'], {
  cwd: REPO,
  encoding: 'utf8',
  timeout: 60_000,
});
let packedFiles = null;
try {
  if (cleanExit(pack)) {
    packedFiles = JSON.parse(pack.stdout)
      .flatMap((entry) => entry.files || [])
      .map((entry) => entry.path);
  }
} catch {
  packedFiles = null;
}
t(Array.isArray(packedFiles), 'npm pack dry-run emits a parseable offline packlist');
t(
  Array.isArray(packedFiles)
    && packedFiles.every((file) => file !== 'eval/opus-fixture' && !file.startsWith('eval/opus-fixture/')),
  'evaluator-only fixture files are excluded from the published npm package',
);

for (const taskId of ['path-normalize', 'json-pointer']) {
  const taskOracleDir = path.join(ORACLE_ROOT, taskId);
  const checks = readdirSync(taskOracleDir)
    .filter((name) => /^check\d+\.mjs$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  t(checks.length >= 2, `${taskId}: direct test found at least two executable checks`);

  for (const checkName of checks) {
    const script = path.join(taskOracleDir, checkName);
    const correct = run(script, path.join(taskOracleDir, 'reference'));
    const defective = run(script, path.join(taskOracleDir, 'broken'));
    t(cleanExit(correct), `${taskId}/${checkName}: correct implementation passes when invoked directly`);
    t(intentionalFailure(defective), `${taskId}/${checkName}: planted-defect implementation fails when invoked directly`);
  }
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
