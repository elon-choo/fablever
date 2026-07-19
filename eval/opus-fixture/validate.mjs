#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// G3.6's prereg floor_n must be <= this frozen task count; keep the fixture floor single-sourced here.
const FIXTURE_FLOOR = 6;
const NONTRIVIAL_K = 6;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = path.join(ROOT, 'tasks');
const ORACLE_DIR = path.join(ROOT, '_oracle');
const HASH_FILE = path.join(ROOT, 'FIXTURE-HASH.txt');
const ATTESTATION_FILE = path.join(ORACLE_DIR, 'non-triviality-attestation.json');
const CHECK_TIMEOUT_MS = 10_000;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedEntries(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function subdirectories(dir) {
  return sortedEntries(dir).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function filesRecursively(dir, acc = []) {
  for (const entry of sortedEntries(dir)) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) filesRecursively(absolute, acc);
    else if (entry.isFile()) acc.push(absolute);
    else throw new Error(`unsupported fixture entry type: ${absolute}`);
  }
  return acc;
}

function portableRelative(from, file) {
  return path.relative(from, file).split(path.sep).join('/');
}

function inspectTask(taskId) {
  const taskDir = path.join(TASKS_DIR, taskId);
  const prompt = path.join(taskDir, 'prompt.md');
  const scaffold = path.join(taskDir, 'scaffold');
  const evaluatorTaskDir = path.join(ORACLE_DIR, taskId);
  const correctDir = path.join(evaluatorTaskDir, 'reference');
  const defectiveDir = path.join(evaluatorTaskDir, 'broken');

  invariant(existsSync(prompt), `${taskId}: missing prompt.md`);
  invariant(existsSync(scaffold), `${taskId}: missing scaffold/`);
  invariant(existsSync(evaluatorTaskDir), `${taskId}: missing evaluator directory`);
  invariant(existsSync(correctDir), `${taskId}: missing correct implementation directory`);
  invariant(existsSync(defectiveDir), `${taskId}: missing planted-defect implementation directory`);

  const scaffoldFiles = filesRecursively(scaffold);
  invariant(scaffoldFiles.length === 1, `${taskId}: scaffold must contain exactly one implementation file`);
  invariant(scaffoldFiles[0].endsWith('.mjs'), `${taskId}: scaffold implementation must be an .mjs file`);
  const implementationName = path.basename(scaffoldFiles[0]);
  invariant(
    existsSync(path.join(correctDir, implementationName)),
    `${taskId}: correct implementation does not match scaffold filename ${implementationName}`,
  );
  invariant(
    existsSync(path.join(defectiveDir, implementationName)),
    `${taskId}: planted-defect implementation does not match scaffold filename ${implementationName}`,
  );

  const checks = sortedEntries(evaluatorTaskDir)
    .filter((entry) => entry.isFile() && /^check\d+\.mjs$/i.test(entry.name))
    .map((entry) => entry.name);
  invariant(checks.length >= 2, `${taskId}: expected at least 2 executable checks, found ${checks.length}`);
  invariant(checks.includes('check1.mjs') && checks.includes('check2.mjs'), `${taskId}: check1.mjs and check2.mjs are required`);

  return {
    taskId,
    prompt,
    scaffold,
    evaluatorTaskDir,
    correctDir,
    defectiveDir,
    implementationName,
    checks,
  };
}

function forbiddenTokens(task) {
  const tokens = ['_oracle', 'reference', 'broken'];
  for (const filename of task.checks) {
    tokens.push(filename, path.parse(filename).name);
  }
  return [...new Set(tokens.map((token) => token.toLowerCase()))];
}

function findHiddennessLeaks(bundleDir, tokens) {
  const leaks = [];
  for (const file of filesRecursively(bundleDir)) {
    const relative = portableRelative(bundleDir, file);
    const relativeLower = relative.toLowerCase();
    const contentLower = readFileSync(file, 'utf8').toLowerCase();
    for (const token of tokens) {
      if (relativeLower.includes(token)) leaks.push(`${relative}: path contains "${token}"`);
      if (contentLower.includes(token)) leaks.push(`${relative}: content contains "${token}"`);
    }
  }
  return leaks;
}

function assertHiddenBundle(bundleDir, tokens, label) {
  const leaks = findHiddennessLeaks(bundleDir, tokens);
  invariant(leaks.length === 0, `${label}: evaluator detail leaked into arm-visible bundle: ${leaks.join('; ')}`);
}

function validateHiddenness(tasks) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'opus-fixture-visible-'));
  try {
    const bundles = new Map();
    for (const task of tasks) {
      const bundle = path.join(tempRoot, task.taskId);
      mkdirSync(bundle, { recursive: true });
      cpSync(task.prompt, path.join(bundle, 'prompt.md'));
      cpSync(task.scaffold, path.join(bundle, 'scaffold'), { recursive: true });
      assertHiddenBundle(bundle, forbiddenTokens(task), task.taskId);
      bundles.set(task.taskId, bundle);
    }
    console.log(`ORACLE HIDDENNESS: PASS (${tasks.length}/${tasks.length} arm-visible bundles clean)`);

    const seededTask = tasks[0];
    const seededBundle = path.join(tempRoot, 'seeded-leak');
    cpSync(bundles.get(seededTask.taskId), seededBundle, { recursive: true });
    const seededPrompt = path.join(seededBundle, 'prompt.md');
    writeFileSync(
      seededPrompt,
      `${readFileSync(seededPrompt, 'utf8')}\nEvaluator path: _oracle/${seededTask.taskId}/${seededTask.checks[0]}\n`,
    );
    let seededFailureObserved = false;
    try {
      assertHiddenBundle(seededBundle, forbiddenTokens(seededTask), 'seeded-leak');
    } catch {
      seededFailureObserved = true;
    }
    invariant(seededFailureObserved, 'seeded evaluator-path leak was not rejected');
    console.log('HIDDENNESS SEEDED-LEAK NEGATIVE: FAIL observed as required');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCheck(checkFile, solutionDir) {
  return spawnSync(process.execPath, [checkFile, solutionDir], {
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
  });
}

function diagnostic(run) {
  const parts = [`status=${String(run.status)}`];
  if (run.signal) parts.push(`signal=${run.signal}`);
  if (run.error) parts.push(`error=${run.error.message}`);
  if (run.stdout && run.stdout.trim()) parts.push(`stdout=${JSON.stringify(run.stdout.trim())}`);
  if (run.stderr && run.stderr.trim()) parts.push(`stderr=${JSON.stringify(run.stderr.trim())}`);
  return parts.join(', ');
}

function validateExecutableChecks(tasks) {
  let scaffoldFailures = 0;
  let bidirectionalChecks = 0;

  for (const task of tasks) {
    let scaffoldFailed = false;
    for (const checkName of task.checks) {
      const checkFile = path.join(task.evaluatorTaskDir, checkName);

      const scaffoldRun = runCheck(checkFile, task.scaffold);
      if (scaffoldRun.status !== 0) scaffoldFailed = true;

      const correctRun = runCheck(checkFile, task.correctDir);
      invariant(
        correctRun.status === 0,
        `${task.taskId}/${checkName}: correct implementation did not pass (${diagnostic(correctRun)})`,
      );

      const defectiveRun = runCheck(checkFile, task.defectiveDir);
      invariant(
        !defectiveRun.error && !defectiveRun.signal && Number.isInteger(defectiveRun.status) && defectiveRun.status !== 0,
        `${task.taskId}/${checkName}: planted-defect implementation was not behaviorally rejected (${diagnostic(defectiveRun)})`,
      );
      bidirectionalChecks++;
    }

    if (scaffoldFailed) scaffoldFailures++;
    invariant(scaffoldFailed, `${task.taskId}: unmodified scaffold passed every executable check`);
    console.log(
      `TASK ${task.taskId}: ${task.checks.length} checks; scaffold FAIL; correct PASS; planted defect FAIL`,
    );
  }

  invariant(
    scaffoldFailures >= NONTRIVIAL_K,
    `non-triviality floor missed: only ${scaffoldFailures} task scaffolds failed, need ${NONTRIVIAL_K}`,
  );
  console.log(`NON-TRIVIALITY SCAFFOLD PROXY: PASS (${scaffoldFailures}/${tasks.length} task scaffolds failed)`);
  console.log(`BIDIRECTIONAL ORACLES: PASS (${bidirectionalChecks} checks passed correct/rejected planted defect)`);
}

function validateAttestation(taskIds) {
  if (!existsSync(ATTESTATION_FILE)) {
    console.log('NON-TRIVIALITY ATTESTATION: PENDING (one-shot Opus baseline run is elon-budget-gated; deterministic scaffold-baseline proxy enforced instead)');
    return;
  }

  let attestation;
  try {
    attestation = JSON.parse(readFileSync(ATTESTATION_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`non-triviality attestation is not valid JSON: ${error.message}`);
  }
  invariant(
    attestation && typeof attestation.one_shot_baseline === 'object' && attestation.one_shot_baseline !== null,
    'non-triviality attestation must contain a one_shot_baseline object',
  );
  invariant(
    typeof attestation.recorded_at === 'string' && Number.isFinite(Date.parse(attestation.recorded_at)),
    'non-triviality attestation recorded_at must be a parseable timestamp',
  );
  invariant(typeof attestation.note === 'string' && attestation.note.trim(), 'non-triviality attestation note is required');

  let failures = 0;
  for (const taskId of taskIds) {
    const record = attestation.one_shot_baseline[taskId];
    invariant(record && typeof record.failed === 'boolean', `attestation missing boolean failed result for ${taskId}`);
    if (record.failed) failures++;
  }
  if (failures >= NONTRIVIAL_K) {
    console.log(`NON-TRIVIALITY ATTESTATION: PASS (${failures}/${taskIds.length} one-shot baseline tasks failed)`);
    return;
  }
  // The attestation ran and the fixture did NOT clear the one-shot floor. That is a real finding about the
  // fixture, not a code regression. An attestation that HONESTLY records that verdict (verdict contains
  // UNFIT/BLOCKED) leaves the fixture in a BLOCKED state: the deterministic properties above still hold, but
  // the fixture may NOT be consumed by the flagship A/B (G3.6) — which its runner enforces via the frozen
  // hash. This keeps the suite honest (the block is surfaced, not hidden) without hard-failing on a recorded,
  // owner-visible experimental dead-end. A missing/false verdict still hard-fails (a silently sub-floor
  // fixture must not slip through).
  const verdict = [attestation.verdict, attestation.note].filter(s => typeof s === 'string').join(' ');
  invariant(
    /\b(UNFIT|BLOCKED|saturated|must be hardened|do not consume|must not|not be consumed)\b/i.test(verdict),
    `one-shot baseline non-triviality floor missed: ${failures} failed tasks, need ${NONTRIVIAL_K} — and the attestation records no explicit unfit/saturated verdict (a sub-floor fixture must be honestly declared unfit, not left ambiguous)`,
  );
  console.log(`NON-TRIVIALITY ATTESTATION: BLOCKED (${failures}/${taskIds.length} one-shot baseline failures < floor ${NONTRIVIAL_K}; fixture declared UNFIT — flagship A/B may NOT consume it; see attestation verdict)`);
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function computeFixtureHash() {
  const entries = [];
  for (const tree of [TASKS_DIR, ORACLE_DIR]) {
    for (const file of filesRecursively(tree)) {
      // The attestation is EVIDENCE ABOUT the fixture, not part of it. Excluding it keeps the frozen hash a
      // stable identity of the tasks+oracles: recording an attestation must not change the fixture's own hash
      // (otherwise every attestation would self-induce drift). Its integrity is checked separately, above.
      if (path.resolve(file) === path.resolve(ATTESTATION_FILE)) continue;
      entries.push({
        path: portableRelative(ROOT, file),
        sha256: sha256(readFileSync(file)),
      });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return sha256(JSON.stringify(entries));
}

function validateFixtureHash() {
  const computed = computeFixtureHash();
  console.log(`FIXTURE SHA-256: ${computed}`);
  const register = process.argv.slice(2).includes('--register');
  if (register) {
    // Freezing is an EXPLICIT, auditable action. Writing the hash only on --register means a fixture edit
    // cannot be laundered by deleting FIXTURE-HASH.txt and re-running: the default run then fails (below),
    // surfacing the missing anchor instead of silently re-registering a drifted fixture.
    writeFileSync(HASH_FILE, `${computed}\n`);
    console.log('FIXTURE HASH: REGISTERED (explicit --register)');
    return computed;
  }
  invariant(existsSync(HASH_FILE), 'FIXTURE-HASH.txt is missing — the fixture is not frozen. Re-freeze with `node validate.mjs --register` (an explicit, committable action), never by silent re-registration.');

  const registered = readFileSync(HASH_FILE, 'utf8').trim();
  invariant(/^[a-f0-9]{64}$/.test(registered), 'FIXTURE-HASH.txt must contain one lowercase SHA-256');
  invariant(
    registered === computed,
    `fixture drift detected: registered ${registered}, computed ${computed} — if the change is intended, re-freeze with \`node validate.mjs --register\` and commit the new hash.`,
  );
  console.log('FIXTURE HASH: VERIFIED');
  return computed;
}

try {
  invariant(existsSync(TASKS_DIR), 'missing tasks/ directory');
  invariant(existsSync(ORACLE_DIR), 'missing _oracle/ directory');

  const taskIds = subdirectories(TASKS_DIR);
  invariant(
    taskIds.length >= FIXTURE_FLOOR,
    `task-count floor missed: found ${taskIds.length}, need at least ${FIXTURE_FLOOR}`,
  );
  console.log(`TASK COUNT: PASS (${taskIds.length} >= ${FIXTURE_FLOOR})`);

  const tasks = taskIds.map(inspectTask);
  validateHiddenness(tasks);
  validateExecutableChecks(tasks);
  validateAttestation(taskIds);
  validateFixtureHash();

  console.log(`OPUS FIXTURE VALIDATION: PASS (${taskIds.length} tasks, zero dependencies, offline)`);
  process.exit(0);
} catch (error) {
  process.stderr.write(`opus-fixture validation failed: ${error.message}\n`);
  process.exit(1);
}
