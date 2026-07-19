#!/usr/bin/env node
// Evaluator-only aggregate oracle for the G3.6 fable-loop arm.
// It deliberately emits only generic PASS/FAIL so hidden assertion details never
// become repair-prompt material. Individual checks are scored separately by run.mjs.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [oracleDirectory, solutionDirectory] = process.argv.slice(2);
if (!oracleDirectory || !solutionDirectory) {
  process.stderr.write('aggregate oracle requires evaluator and solution directories\n');
  process.exit(2);
}

let checks;
try {
  checks = readdirSync(path.resolve(oracleDirectory), { withFileTypes: true })
    .filter(entry => entry.isFile() && /^check\d+\.mjs$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
} catch {
  process.stderr.write('ERROR\n');
  process.exit(2);
}

if (checks.length === 0) {
  process.stderr.write('ERROR\n');
  process.exit(2);
}

for (const check of checks) {
  const execution = spawnSync(
    process.execPath,
    [path.join(path.resolve(oracleDirectory), check), path.resolve(solutionDirectory)],
    {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  if (execution.error || execution.signal || execution.status !== 0) {
    process.stderr.write('FAIL\n');
    process.exit(1);
  }
}

process.stdout.write('PASS\n');
