#!/usr/bin/env node
// G3.6 bidirectional offline acceptance test.
// No real model, network, auth, or token spend.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARM_IDS,
  discoverFixture,
  scoreFixtureSolutions,
} from '../eval/verified-loop-ab/run.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = path.join(REPO, 'eval', 'verified-loop-ab', 'run.mjs');
const PREREG_LINT = path.join(REPO, 'eval', 'opus-prereg', 'lint.mjs');
const ORACLE_ROOT = path.join(REPO, 'eval', 'opus-fixture', '_oracle');
const EXPECTED_ARMS = [
  'plain-opus',
  'one-shot-stop-gate',
  'prompt-matched-solo',
  'fable-loop',
];
const EXPECTED_TASKS = [
  'csv-parse',
  'duration-parse',
  'json-pointer',
  'path-normalize',
  'semver-compare',
  'token-bucket',
];

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name} — ${error.message}`);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runHarness(args, env = process.env) {
  return spawnSync(process.execPath, [RUN, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
    env,
  });
}

function markerRows(marker) {
  if (!existsSync(marker)) return [];
  return readFileSync(marker, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

console.log('verified-loop preregistered A/B harness (G3.6):');

const root = mkdtempSync(path.join(tmpdir(), 'verified-loop-ab-'));
try {
  const fakeRunner = path.join(root, 'fake-arm-runner.mjs');
  const marker = path.join(root, 'runner-calls.jsonl');
  writeFileSync(fakeRunner, `
import { appendFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const request = JSON.parse(readFileSync(0, 'utf8'));
appendFileSync(process.env.FABLE_AB_MARKER, JSON.stringify(request) + '\\n');
const sourceKind = request.arm === 'fable-loop' && request.phase === 'generation'
  ? 'broken'
  : 'reference';
const source = path.join(
  process.env.FABLE_AB_FAKE_REFERENCE_ROOT,
  request.task_id,
  sourceKind,
  request.implementation_file,
);
copyFileSync(source, path.join(request.solution_dir, request.implementation_file));
const total = request.phase === 'repair' ? 20 : 10;
process.stdout.write(JSON.stringify({
  usage: { input: total - 2, output: 2, total },
  final_message: 'offline shim completed its requested phase',
  provider: 'offline-fixture-shim',
  model: 'no-model',
}) + '\\n');
`);

  const dryOut = path.join(root, 'dry-out');
  const dry = runHarness([
    '--dry-run',
    '--json',
    `--out=${dryOut}`,
    `--arm-runner=${fakeRunner}`,
  ], {
    ...process.env,
    FABLE_AB_MARKER: marker,
  });
  const plan = parseJson(dry.stdout);

  await check('--dry-run exits zero and performs no runner/model call or write', () => {
    assert.equal(dry.status, 0, dry.stderr || dry.stdout);
    assert.ok(plan);
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(dryOut), false);
    assert.deepEqual(plan.side_effects, {
      model_calls: 0,
      token_spend: 0,
      network: 0,
      writes: 0,
    });
  });

  await check('dry plan names exactly the four preregistered arms in order', () => {
    assert.deepEqual(plan.arms.map(arm => arm.id), EXPECTED_ARMS);
    assert.deepEqual(ARM_IDS, EXPECTED_ARMS);
    assert.equal(plan.total_runs, 24);
  });

  await check('dry plan lists the six frozen fixture tasks', () => {
    assert.deepEqual(plan.tasks, EXPECTED_TASKS);
    assert.equal(plan.task_count, 6);
  });

  await check('dry plan binds oracle-level pass-rate scoring to all 12 G0.2 checks', () => {
    assert.equal(plan.scoring.primary_metric, 'per-arm hidden-oracle pass rate');
    assert.equal(plan.scoring.oracle_count, 12);
    assert.match(plan.scoring.formula, /passed executable G0\.2 oracles/);
    assert.match(plan.scoring.invocation, /exit 0 = PASS/);
  });

  await check('dry plan reuses the G0.1 per-arm cost fields', () => {
    assert.deepEqual(plan.cost_report.fields_per_arm, [
      'tokens',
      'wall_clock_ms',
      'fixture_sha256',
      'runs',
    ]);
    assert.deepEqual(Object.keys(plan.cost_report.shape.perArm).sort(), [...EXPECTED_ARMS].sort());
  });

  await check('dry plan binds to opus-verified-loop-ab-2026-07 and the G3.5 module', () => {
    assert.equal(plan.prereg.experiment_id, 'opus-verified-loop-ab-2026-07');
    assert.equal(plan.verified_loop_module, 'orchestration/lib/verified-loop.mjs');
    assert.match(plan.hard_preconditions.real_run_budget_flag, /budget-confirmed/);
  });

  const skeletonPath = path.join(root, 'RESULTS-skeleton.md');
  writeFileSync(skeletonPath, plan.results_skeleton);
  const skeletonLint = spawnSync(
    process.execPath,
    [PREREG_LINT, `--results=${skeletonPath}`],
    { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
  );
  await check('dry-run results skeleton carries a lint-clean prereg-binding', () => {
    assert.match(
      plan.results_skeleton,
      /<!-- prereg-binding: {"experiment_id":"opus-verified-loop-ab-2026-07","first_run_at":"[^"]+"} -->/,
    );
    assert.match(plan.results_skeleton, /NO RUN OCCURRED/);
    assert.equal(skeletonLint.status, 0, skeletonLint.stderr || skeletonLint.stdout);
  });

  const blockedOut = path.join(root, 'blocked-out');
  const blocked = runHarness([
    '--simulation',
    `--arm-runner=${fakeRunner}`,
    `--out=${blockedOut}`,
  ], {
    ...process.env,
    FABLE_AB_MARKER: marker,
    FABLE_AB_FAKE_REFERENCE_ROOT: ORACLE_ROOT,
  });
  await check('real mode without --budget-confirmed fails before every runner/model call', () => {
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /budget-confirmation precondition failed before arm start/);
    assert.equal(markerRows(marker).length, 0);
    assert.equal(existsSync(blockedOut), false);
  });

  const fixture = discoverFixture();
  const correctRoot = path.join(root, 'correct-solutions');
  const brokenRoot = path.join(root, 'broken-solutions');
  mkdirSync(correctRoot);
  mkdirSync(brokenRoot);
  for (const task of fixture.tasks) {
    cpSync(
      path.join(task.evaluatorDirectory, 'reference'),
      path.join(correctRoot, task.id),
      { recursive: true },
    );
    cpSync(
      path.join(task.evaluatorDirectory, 'broken'),
      path.join(brokenRoot, task.id),
      { recursive: true },
    );
  }
  const correctScore = scoreFixtureSolutions(correctRoot);
  const brokenScore = scoreFixtureSolutions(brokenRoot);

  await check('scorer actually runs the hidden oracles: correct solutions score 1.0', () => {
    assert.equal(correctScore.total_oracles, 12);
    assert.equal(correctScore.passed_oracles, 12);
    assert.equal(correctScore.pass_rate, 1);
  });

  await check('scorer actually runs the hidden oracles: planted broken solutions score below 1.0', () => {
    assert.equal(brokenScore.total_oracles, 12);
    assert.ok(brokenScore.pass_rate < 1);
    assert.ok(brokenScore.passed_oracles < brokenScore.total_oracles);
  });

  const simulationOut = path.join(root, 'simulation-out');
  const simulation = runHarness([
    '--simulation',
    `--arm-runner=${fakeRunner}`,
    '--budget-confirmed=owner-budget-test-attestation',
    `--out=${simulationOut}`,
  ], {
    ...process.env,
    FABLE_AB_MARKER: marker,
    FABLE_AB_FAKE_REFERENCE_ROOT: ORACLE_ROOT,
  });
  const calls = markerRows(marker);

  await check('budget-confirmed fake runner proceeds through all 24 task-arm rows offline', () => {
    assert.equal(simulation.status, 0, simulation.stderr || simulation.stdout);
  });
  const resultsPath = path.join(simulationOut, 'results.json');
  const results = existsSync(resultsPath)
    ? parseJson(readFileSync(resultsPath, 'utf8'))
    : null;

  await check('fable-loop uses executable FAIL-anchored repair through G3.5', () => {
    assert.ok(results);
    assert.equal(results.simulation, true);
    assert.equal(results.cost_report.total_runs, 24);
    assert.deepEqual(results.arm_order, EXPECTED_ARMS);
    assert.deepEqual(results.task_order, EXPECTED_TASKS);
    const generationCalls = calls.filter(call => call.phase === 'generation');
    const repairCalls = calls.filter(call => call.phase === 'repair');
    assert.equal(generationCalls.length, 24);
    assert.equal(repairCalls.length, 6);
    const meta = parseJson(readFileSync(
      path.join(simulationOut, 'archive', 'csv-parse', 'fable-loop.meta.json'),
      'utf8',
    ));
    assert.equal(meta.model_calls, 2);
    assert.equal(meta.loop_status, 'criterion-complete');
  });

  await check('no injected arm request contains hidden oracle paths or check filenames', () => {
    assert.equal(calls.length, 30);
    for (const call of calls) {
      const serialized = JSON.stringify(call);
      assert.doesNotMatch(serialized, /_oracle/);
      assert.doesNotMatch(serialized, /check\d+\.mjs/i);
      assert.equal(
        path.resolve(call.workspace_dir).startsWith(`${path.resolve(simulationOut)}${path.sep}`),
        false,
      );
    }
    assert.equal(existsSync(path.join(simulationOut, 'state')), false);
  });

  await check('offline pipeline scores every final arm solution at 1.0', () => {
    for (const arm of EXPECTED_ARMS) {
      assert.equal(results.scores[arm].passed_oracles, 12);
      assert.equal(results.scores[arm].total_oracles, 12);
      assert.equal(results.scores[arm].pass_rate, 1);
    }
  });

  await check('archive replay emits the exact per-arm G0.1 cost-report shape', () => {
    for (const arm of EXPECTED_ARMS) {
      const cost = results.cost_report.perArm[arm];
      assert.deepEqual(Object.keys(cost).sort(), [
        'fixture_sha256',
        'runs',
        'tokens',
        'wall_clock_ms',
      ]);
      assert.equal(cost.runs, 6);
      assert.match(cost.fixture_sha256, /^[a-f0-9]{64}$/);
      assert.ok(cost.wall_clock_ms >= 0);
    }
    assert.equal(results.cost_report.perArm['plain-opus'].tokens, 60);
    assert.equal(results.cost_report.perArm['one-shot-stop-gate'].tokens, 60);
    assert.equal(results.cost_report.perArm['prompt-matched-solo'].tokens, 60);
    assert.equal(results.cost_report.perArm['fable-loop'].tokens, 180);
  });

  const simulationResultsPath = path.join(simulationOut, 'RESULTS.md');
  const simulationLint = spawnSync(
    process.execPath,
    [PREREG_LINT, `--results=${simulationResultsPath}`],
    { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
  );
  await check('emitted simulation results retain a clean prereg-binding without claiming a real A/B', () => {
    const markdown = readFileSync(simulationResultsPath, 'utf8');
    assert.match(markdown, /OFFLINE SIMULATION \(NOT EXPERIMENT RESULTS\)/);
    assert.match(markdown, /opus-verified-loop-ab-2026-07/);
    assert.equal(simulationLint.status, 0, simulationLint.stderr || simulationLint.stdout);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
