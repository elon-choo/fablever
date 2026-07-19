#!/usr/bin/env node
// G3.6 — preregistered verified-loop Opus A/B harness.
//
//   node eval/verified-loop-ab/run.mjs --dry-run [--json]
//   node eval/verified-loop-ab/run.mjs --budget-confirmed=<owner-attestation-ref> [--out=<dir>]
//
// A real execution uses the default opus-arm-runner and additionally requires the
// G0.2 one-shot baseline attestation. Offline tests may inject --arm-runner=<shim>
// only together with --simulation. Every non-dry execution still requires the
// explicit owner-budget flag before any output write or runner/model call.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCostReport } from '../codex-native-ab/cost-report.mjs';
import { DEFAULT_BUDGETS } from '../../orchestration/lib/budget.mjs';
import {
  PLAN_TRIGGER,
  writePlanArtifact,
} from '../../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  createRun,
} from '../../orchestration/lib/run-state.mjs';
import {
  VERIFIED_LOOP_ENABLED_VALUE,
  VERIFIED_LOOP_ENV,
  defineExecutableOracle,
  runVerifiedCompletionLoop,
} from '../../orchestration/lib/verified-loop.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '..', '..');
const FIXTURE_ROOT = path.join(REPO, 'eval', 'opus-fixture');
const PREREG_PATH = path.join(
  REPO,
  'eval',
  'opus-prereg',
  'verified-loop-ab-2026-07.prereg.json',
);
const PREREG_LINT = path.join(REPO, 'eval', 'opus-prereg', 'lint.mjs');
const AGGREGATE_ORACLE = path.join(DIR, 'aggregate-oracle.mjs');
const DEFAULT_ARM_RUNNER = path.join(DIR, 'opus-arm-runner.mjs');
const BASELINE_ATTESTATION = path.join(
  FIXTURE_ROOT,
  '_oracle',
  'non-triviality-attestation.json',
);
const EXPERIMENT_ID = 'opus-verified-loop-ab-2026-07';
const CHECK_TIMEOUT_MS = 10_000;
const DEFAULT_RUNNER_TIMEOUT_MS = 15 * 60 * 1000;

export const ARM_IDS = Object.freeze([
  'plain-opus',
  'one-shot-stop-gate',
  'prompt-matched-solo',
  'fable-loop',
]);

export const ARM_DEFINITIONS = Object.freeze({
  'plain-opus': Object.freeze({
    label: 'Plain Opus',
    outputStyle: 'default',
    stopGate: false,
    criteria: false,
    verifiedLoop: false,
    description: 'Original task prompt; no Fable style, stop gate, durable state, or verified loop.',
  }),
  'one-shot-stop-gate': Object.freeze({
    label: 'One-shot stop gate',
    outputStyle: 'fable',
    stopGate: true,
    criteria: false,
    verifiedLoop: false,
    description: 'One Opus session with the current one-time fable stop gate; no durable verified loop.',
  }),
  'prompt-matched-solo': Object.freeze({
    label: 'Prompt-matched solo',
    outputStyle: 'fable',
    stopGate: false,
    criteria: true,
    verifiedLoop: false,
    description: 'One Opus session with the exact acceptance criterion used by fable-loop; no durable state.',
  }),
  'fable-loop': Object.freeze({
    label: 'Fable Loop',
    outputStyle: 'fable',
    stopGate: false,
    criteria: true,
    verifiedLoop: true,
    description: 'Same criterion as prompt-matched solo, owned by the G3.5 loop with executable-FAIL-only bounded repair.',
  }),
});

const compareText = (a, b) => a.localeCompare(b);
const portableRelative = (from, target) => path.relative(from, target).split(path.sep).join('/');
const sha256 = value => createHash('sha256').update(value).digest('hex');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedEntries(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => compareText(a.name, b.name));
}

function recursiveFiles(directory, root = directory, output = []) {
  for (const entry of sortedEntries(directory)) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) recursiveFiles(absolute, root, output);
    else if (entry.isFile()) {
      output.push({
        absolute,
        relative: portableRelative(root, absolute),
      });
    } else {
      throw new Error(`unsupported fixture entry type: ${absolute}`);
    }
  }
  return output;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function loadPrereg() {
  const prereg = readJson(PREREG_PATH, 'verified-loop preregistration');
  invariant(prereg.experiment_id === EXPERIMENT_ID, 'verified-loop prereg experiment id drifted');
  invariant(
    JSON.stringify(prereg.arms) === JSON.stringify(ARM_IDS),
    'verified-loop prereg arm list/order drifted',
  );
  invariant(prereg.task_n === 6 && prereg.floor_n <= prereg.task_n, 'verified-loop prereg task floor drifted');
  return prereg;
}

function findImplementation(scaffoldDirectory, taskId) {
  const files = recursiveFiles(scaffoldDirectory);
  invariant(files.length === 1, `${taskId}: scaffold must contain exactly one implementation file`);
  invariant(files[0].absolute.endsWith('.mjs'), `${taskId}: scaffold implementation must be .mjs`);
  return files[0];
}

export function discoverFixture(fixtureRoot = FIXTURE_ROOT) {
  const root = path.resolve(fixtureRoot);
  const tasksRoot = path.join(root, 'tasks');
  const oracleRoot = path.join(root, '_oracle');
  const taskIds = sortedEntries(tasksRoot)
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  const tasks = taskIds.map(taskId => {
    const taskDirectory = path.join(tasksRoot, taskId);
    const promptPath = path.join(taskDirectory, 'prompt.md');
    const scaffoldDirectory = path.join(taskDirectory, 'scaffold');
    const evaluatorDirectory = path.join(oracleRoot, taskId);
    invariant(existsSync(promptPath), `${taskId}: missing prompt.md`);
    invariant(existsSync(scaffoldDirectory), `${taskId}: missing scaffold directory`);
    invariant(existsSync(evaluatorDirectory), `${taskId}: missing evaluator directory`);
    const implementation = findImplementation(scaffoldDirectory, taskId);
    const checks = sortedEntries(evaluatorDirectory)
      .filter(entry => entry.isFile() && /^check\d+\.mjs$/i.test(entry.name))
      .map(entry => path.join(evaluatorDirectory, entry.name));
    invariant(checks.length >= 2, `${taskId}: expected at least two executable oracles`);
    return Object.freeze({
      id: taskId,
      promptPath,
      prompt: readFileSync(promptPath, 'utf8').trim(),
      scaffoldDirectory,
      evaluatorDirectory,
      implementationName: path.basename(implementation.absolute),
      checks: Object.freeze(checks),
    });
  });
  return Object.freeze({
    root,
    tasksRoot,
    oracleRoot,
    tasks: Object.freeze(tasks),
  });
}

export function computeFixtureHash(fixtureRoot = FIXTURE_ROOT) {
  const root = path.resolve(fixtureRoot);
  const attestationAbs = path.resolve(root, '_oracle', 'non-triviality-attestation.json');
  const entries = [];
  for (const tree of [path.join(root, 'tasks'), path.join(root, '_oracle')]) {
    for (const file of recursiveFiles(tree, root)) {
      // The attestation is evidence ABOUT the fixture, not part of it — exclude it so recording an
      // attestation never self-induces drift. Must match validate.mjs's identical exclusion.
      if (path.resolve(file.absolute) === attestationAbs) continue;
      entries.push({
        path: file.relative,
        sha256: sha256(readFileSync(file.absolute)),
      });
    }
  }
  entries.sort((a, b) => compareText(a.path, b.path));
  return sha256(JSON.stringify(entries));
}

function registeredFixtureHash(fixtureRoot = FIXTURE_ROOT) {
  const file = path.join(fixtureRoot, 'FIXTURE-HASH.txt');
  const registered = readFileSync(file, 'utf8').trim();
  invariant(/^[a-f0-9]{64}$/.test(registered), 'G0.2 fixture register is not a lowercase SHA-256');
  const computed = computeFixtureHash(fixtureRoot);
  invariant(
    registered === computed,
    `G0.2 fixture drift detected: registered ${registered}, computed ${computed}`,
  );
  return registered;
}

function afterRegistrationTimestamp(prereg) {
  const registered = Date.parse(prereg.registered_at);
  invariant(Number.isFinite(registered), 'prereg registered_at is not parseable');
  return new Date(Math.max(Date.now(), registered + 1_000)).toISOString();
}

function acceptanceCriterion(task) {
  return `The ${task.id} implementation satisfies every stated task requirement and passes the frozen executable oracle.`;
}

function promptWithCriterion(task, phase) {
  const criterion = acceptanceCriterion(task);
  const phaseInstruction = phase === 'repair'
    ? 'The previous evaluator-side executable oracle returned FAIL. Repair the existing implementation using only the stated task requirements; hidden evaluator details are unavailable.'
    : 'Implement the task in the existing scaffold.';
  return [
    task.prompt,
    '',
    'Acceptance criterion (identical in prompt-matched-solo and fable-loop):',
    `- ${criterion}`,
    '',
    phaseInstruction,
  ].join('\n');
}

function armPrompt(task, armId, phase = 'generation') {
  if (armId === 'prompt-matched-solo' || armId === 'fable-loop') {
    return promptWithCriterion(task, phase);
  }
  return task.prompt;
}

function dryCostShape() {
  return Object.fromEntries(ARM_IDS.map(arm => [
    arm,
    {
      tokens: null,
      wall_clock_ms: null,
      fixture_sha256: null,
      runs: 6,
    },
  ]));
}

function emptyScores() {
  return Object.fromEntries(ARM_IDS.map(arm => [
    arm,
    {
      passed_oracles: null,
      total_oracles: 12,
      pass_rate: null,
    },
  ]));
}

export function renderResultsMarkdown({
  firstRunAt,
  fixtureHash,
  scores = emptyScores(),
  costReport = { complete: false, total_runs: 0, perArm: dryCostShape() },
  simulation = false,
  dryRun = false,
} = {}) {
  invariant(typeof firstRunAt === 'string' && Number.isFinite(Date.parse(firstRunAt)), 'results firstRunAt must be ISO-8601');
  const heading = dryRun
    ? '# Verified-loop Opus A/B — DRY-RUN RESULTS SKELETON (NO RUN OCCURRED)'
    : simulation
      ? '# Verified-loop Opus A/B — OFFLINE SIMULATION (NOT EXPERIMENT RESULTS)'
      : '# Verified-loop Opus A/B — Results';
  const rows = ARM_IDS.map(arm => {
    const score = scores[arm] || {};
    const cost = costReport.perArm?.[arm] || {};
    const fmt = value => value === null || value === undefined ? 'PENDING' : String(value);
    return `| ${arm} | ${fmt(score.passed_oracles)}/${fmt(score.total_oracles)} | ${fmt(score.pass_rate)} | ${fmt(cost.tokens)} | ${fmt(cost.wall_clock_ms)} | ${fmt(cost.runs)} |`;
  });
  return [
    heading,
    `<!-- prereg-binding: ${JSON.stringify({ experiment_id: EXPERIMENT_ID, first_run_at: firstRunAt })} -->`,
    '',
    dryRun
      ? 'This is a structural template emitted by `--dry-run`; no model call, token spend, or A/B result occurred.'
      : simulation
        ? 'This file exercises the harness with an injected offline shim. It is not an Opus result and cannot decide ship/park.'
        : 'The frozen executable oracles decide pass rate; no LLM judge is used.',
    '',
    `Fixture SHA-256: \`${fixtureHash}\``,
    '',
    '| arm | hidden-oracle passes | pass rate | tokens | wall-clock ms | task runs |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    'Decision rule: PENDING owner-authorized real run; publish the preregistered ship/park outcome verbatim, including null.',
    '',
    'Guard metric: on atomic single-file work, extra fable-loop model/repair work is a cost penalty rather than a success signal.',
    '',
  ].join('\n');
}

export function buildDryRunPlan({
  fixtureRoot = FIXTURE_ROOT,
  firstRunAt,
} = {}) {
  const prereg = loadPrereg();
  const fixture = discoverFixture(fixtureRoot);
  const fixtureHash = registeredFixtureHash(fixtureRoot);
  invariant(fixture.tasks.length === prereg.task_n, 'fixture task count does not match prereg task_n');
  const totalOracles = fixture.tasks.reduce((sum, task) => sum + task.checks.length, 0);
  invariant(totalOracles === 12, `expected 12 frozen executable oracles, found ${totalOracles}`);
  const skeletonTimestamp = firstRunAt || afterRegistrationTimestamp(prereg);
  return Object.freeze({
    eval: 'verified-loop-ab',
    mode: 'dry-run',
    prereg: Object.freeze({
      experiment_id: prereg.experiment_id,
      path: portableRelative(REPO, PREREG_PATH),
      decision_rule: prereg.decision_rule,
    }),
    arms: Object.freeze(ARM_IDS.map(id => Object.freeze({
      id,
      ...ARM_DEFINITIONS[id],
    }))),
    tasks: Object.freeze(fixture.tasks.map(task => task.id)),
    task_count: fixture.tasks.length,
    total_runs: fixture.tasks.length * ARM_IDS.length,
    scoring: Object.freeze({
      primary_metric: 'per-arm hidden-oracle pass rate',
      formula: 'passed executable G0.2 oracles / all executable G0.2 oracles',
      oracle_count: totalOracles,
      invocation: 'node <frozen-check.mjs> <arm-produced-solution-dir>; exit 0 = PASS',
      unit: 'oracle execution (12 total), not six task-level all-pass summaries',
    }),
    cost_report: Object.freeze({
      shape: Object.freeze({
        complete: false,
        total_runs: fixture.tasks.length * ARM_IDS.length,
        perArm: dryCostShape(),
      }),
      fields_per_arm: Object.freeze([
        'tokens',
        'wall_clock_ms',
        'fixture_sha256',
        'runs',
      ]),
    }),
    fixture: Object.freeze({
      registered_sha256: fixtureHash,
      hash_verified: true,
    }),
    hard_preconditions: Object.freeze({
      real_run_budget_flag: '--budget-confirmed=<attestation-ref>',
      one_shot_baseline_attestation: existsSync(BASELINE_ATTESTATION)
        ? 'present'
        : 'PENDING — required before the default live Opus runner can start',
    }),
    verified_loop_module: portableRelative(REPO, path.join(REPO, 'orchestration', 'lib', 'verified-loop.mjs')),
    results_skeleton: renderResultsMarkdown({
      firstRunAt: skeletonTimestamp,
      fixtureHash,
      dryRun: true,
    }),
    side_effects: Object.freeze({
      model_calls: 0,
      token_spend: 0,
      network: 0,
      writes: 0,
    }),
  });
}

function oracleDiagnostic(execution) {
  return {
    status: Number.isInteger(execution.status) ? execution.status : null,
    signal: execution.signal || null,
    error: execution.error ? execution.error.message : null,
    stdout: String(execution.stdout || ''),
    stderr: String(execution.stderr || ''),
  };
}

export function scoreFixtureSolutions(solutionRoot, {
  fixtureRoot = FIXTURE_ROOT,
  solutionSubdirectory = '',
} = {}) {
  const fixture = discoverFixture(fixtureRoot);
  let passed = 0;
  let total = 0;
  const byTask = {};
  for (const task of fixture.tasks) {
    const solutionDirectory = path.join(
      path.resolve(solutionRoot),
      task.id,
      ...(solutionSubdirectory ? [solutionSubdirectory] : []),
    );
    const oracleRuns = task.checks.map(check => {
      const execution = spawnSync(process.execPath, [check, solutionDirectory], {
        cwd: REPO,
        encoding: 'utf8',
        timeout: CHECK_TIMEOUT_MS,
        windowsHide: true,
      });
      const pass = !execution.error && !execution.signal && execution.status === 0;
      total++;
      if (pass) passed++;
      return {
        check: path.basename(check),
        pass,
        ...oracleDiagnostic(execution),
      };
    });
    const taskPassed = oracleRuns.filter(run => run.pass).length;
    byTask[task.id] = {
      passed_oracles: taskPassed,
      total_oracles: oracleRuns.length,
      pass_rate: oracleRuns.length ? taskPassed / oracleRuns.length : 0,
      oracles: oracleRuns,
    };
  }
  return {
    passed_oracles: passed,
    total_oracles: total,
    pass_rate: total ? passed / total : 0,
    by_task: byTask,
  };
}

function normalizeUsage(input, label) {
  invariant(input && typeof input === 'object', `${label}: runner response usage is required`);
  const finite = value => Number.isFinite(value) && value >= 0;
  if (finite(input.total)) {
    const inputTokens = finite(input.input) ? input.input : 0;
    const outputTokens = finite(input.output) ? input.output : 0;
    return {
      ...input,
      input: inputTokens,
      output: outputTokens,
      total: input.total,
    };
  }
  const inputTokens = [
    input.input,
    input.input_tokens,
    input.cache_creation_input_tokens,
    input.cache_read_input_tokens,
  ].reduce((sum, value) => sum + (finite(value) ? value : 0), 0);
  const outputTokens = finite(input.output)
    ? input.output
    : finite(input.output_tokens)
      ? input.output_tokens
      : 0;
  invariant(
    inputTokens > 0 || outputTokens > 0,
    `${label}: runner usage must contain total or input/output token fields`,
  );
  return {
    ...input,
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
  };
}

function mergeUsage(target, addition) {
  target.input += addition.input;
  target.output += addition.output;
  target.total += addition.total;
}

function runnerCommand(runnerPath) {
  const absolute = path.resolve(runnerPath);
  return /\.[cm]?js$/i.test(absolute)
    ? { command: process.execPath, args: [absolute] }
    : { command: absolute, args: [] };
}

function invokeArmRunner({
  runnerPath,
  request,
  budgetConfirmed,
  baselineAttested,
  timeoutMs,
}) {
  const serialized = JSON.stringify(request);
  invariant(!serialized.includes('_oracle'), 'arm-runner request leaked evaluator-only _oracle path');
  invariant(!/check\d+\.mjs/i.test(serialized), 'arm-runner request leaked hidden check filename');
  const runner = runnerCommand(runnerPath);
  const execution = spawnSync(runner.command, runner.args, {
    cwd: request.workspace_dir,
    input: serialized,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      FABLE_OPUS_BUDGET_CONFIRMED: budgetConfirmed,
      FABLE_OPUS_BASELINE_ATTESTED: baselineAttested ? '1' : '0',
    },
  });
  if (execution.error) throw new Error(`arm runner failed: ${execution.error.message}`);
  if (execution.signal) throw new Error(`arm runner terminated by ${execution.signal}`);
  if (execution.status !== 0) {
    throw new Error(
      `arm runner exited ${String(execution.status)}: ${String(execution.stderr || '').trim()}`,
    );
  }
  let response;
  try {
    response = JSON.parse(String(execution.stdout || '').trim());
  } catch (error) {
    throw new Error(`arm runner emitted invalid JSON: ${error.message}`);
  }
  return {
    response: {
      ...response,
      usage: normalizeUsage(response.usage, `${request.task_id}/${request.arm}/${request.phase}`),
    },
    stderr: String(execution.stderr || ''),
  };
}

function copyArmVisibleTask(task, destination) {
  mkdirSync(destination, { recursive: true });
  cpSync(task.promptPath, path.join(destination, 'prompt.md'));
  cpSync(task.scaffoldDirectory, path.join(destination, 'scaffold'), { recursive: true });
  return {
    workspaceDirectory: destination,
    solutionDirectory: path.join(destination, 'scaffold'),
  };
}

function validateBaselineAttestation(tasks) {
  invariant(
    existsSync(BASELINE_ATTESTATION),
    'real Opus run precondition failed before arm start: G0.2 one-shot baseline attestation is absent',
  );
  const attestation = readJson(BASELINE_ATTESTATION, 'G0.2 one-shot baseline attestation');
  invariant(
    Number.isFinite(Date.parse(attestation.recorded_at)),
    'G0.2 one-shot baseline attestation recorded_at is invalid',
  );
  invariant(
    typeof attestation.note === 'string' && attestation.note.trim(),
    'G0.2 one-shot baseline attestation note is required',
  );
  let failures = 0;
  for (const task of tasks) {
    const record = attestation.one_shot_baseline?.[task.id];
    invariant(
      record && typeof record.failed === 'boolean',
      `G0.2 one-shot baseline attestation is missing ${task.id}`,
    );
    if (record.failed) failures++;
  }
  invariant(
    failures >= tasks.length,
    `G0.2 one-shot baseline attestation has insufficient headroom (${failures}/${tasks.length})`,
  );
  return true;
}

function ensureFreshOutput(outDirectory) {
  if (existsSync(outDirectory)) {
    const metadata = statSync(outDirectory);
    invariant(metadata.isDirectory(), `output path is not a directory: ${outDirectory}`);
    invariant(readdirSync(outDirectory).length === 0, `output directory is not empty: ${outDirectory}`);
  } else {
    mkdirSync(outDirectory, { recursive: true });
  }
}

function writeArchiveRow(archiveRoot, taskId, armId, meta, calls) {
  const taskDirectory = path.join(archiveRoot, taskId);
  mkdirSync(taskDirectory, { recursive: true });
  writeFileSync(
    path.join(taskDirectory, `${armId}.meta.json`),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  writeFileSync(
    path.join(taskDirectory, `${armId}.raw.jsonl`),
    `${calls.map(call => JSON.stringify(call)).join('\n')}\n`,
  );
}

function createLoopAuthority(task, solutionDirectory, stateDirectory) {
  const projectRoot = path.join(stateDirectory, 'project');
  const runDirectory = path.join(stateDirectory, 'run');
  mkdirSync(projectRoot, { recursive: true });
  const criterion = acceptanceCriterion(task);
  const plan = writePlanArtifact(
    projectRoot,
    `${task.id}-fable-loop`,
    {
      title: `${task.id} fable-loop acceptance`,
      outcome: `The ${task.id} solution is decided by current executable evidence.`,
      scope: {
        in: ['The arm-visible task prompt, scaffold implementation, and evaluator-owned executable result.'],
        out: ['Hidden oracle disclosure, judge preference, extra generation rounds, and default runtime changes.'],
      },
      criteria: [`[criterion.solution] ${criterion}`],
      orderedDependencies: [
        'Perform one generation action against the arm-visible task.',
        'Run the bound aggregate executable oracle.',
        'Allow repair only after a captured executable FAIL and within the verified-loop cap.',
      ],
      riskyAssumptions: [
        'A generic FAIL notice plus the original task requirements is sufficient repair context without hidden assertion leakage.',
      ],
      nonGoals: [
        'Use a judge, critique, hidden test detail, or prose completion claim as retry evidence.',
      ],
    },
    { trigger: PLAN_TRIGGER },
  );
  const sourcePaths = [
    AGGREGATE_ORACLE,
    ...task.checks,
  ].map(file => portableRelative(REPO, file));
  const oracle = defineExecutableOracle({
    checkId: 'check.solution',
    command: process.execPath,
    args: [AGGREGATE_ORACLE, task.evaluatorDirectory, solutionDirectory],
    cwd: solutionDirectory,
    timeoutMs: CHECK_TIMEOUT_MS * task.checks.length,
    sourceRoot: REPO,
    sourcePaths,
    targetRoot: solutionDirectory,
    targetPaths: [task.implementationName],
  });
  createRun(
    runDirectory,
    {
      schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
      runId: `g3.6-${task.id}-fable-loop`,
      goal: `Complete ${task.id} only through its bound executable oracle.`,
      criteria: [
        {
          id: 'criterion.solution',
          description: criterion,
        },
      ],
      scope: {
        include: [task.implementationName],
        exclude: ['hidden evaluator sources', 'default runtime paths'],
      },
      allowedActions: [
        'perform one generation action',
        'run the bound aggregate executable oracle',
        'perform executable-FAIL-anchored repair within the proven cap',
      ],
      blockers: [],
      checks: [
        {
          id: oracle.checkId,
          criterionId: 'criterion.solution',
          type: 'command',
          definition: oracle.definition,
        },
      ],
      planPath: plan.path,
      planHash: plan.sha256,
    },
  );
  return { runDirectory, oracle };
}

async function executeTaskArm({
  task,
  armId,
  outputRoot,
  archiveRoot,
  runnerPath,
  model,
  budgetConfirmed,
  baselineAttested,
  fixtureHash,
  simulation,
  runnerTimeoutMs,
}) {
  const arm = ARM_DEFINITIONS[armId];
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), `verified-loop-ab-${task.id}-${armId}-`));
  const stateRoot = arm.verifiedLoop
    ? mkdtempSync(path.join(tmpdir(), `verified-loop-ab-state-${task.id}-`))
    : null;
  const { workspaceDirectory, solutionDirectory } = copyArmVisibleTask(
    task,
    path.join(workspaceRoot, 'workspace'),
  );
  const calls = [];
  const usage = { input: 0, output: 0, total: 0 };

  const callRunner = async (phase) => {
    const request = {
      protocol_version: 1,
      experiment_id: EXPERIMENT_ID,
      arm: armId,
      task_id: task.id,
      phase,
      prompt: armPrompt(task, armId, phase),
      acceptance_criteria: arm.criteria ? [acceptanceCriterion(task)] : [],
      workspace_dir: workspaceDirectory,
      solution_dir: solutionDirectory,
      implementation_file: task.implementationName,
      model,
      output_style: arm.outputStyle,
      stop_gate: arm.stopGate,
      timeout_ms: runnerTimeoutMs,
    };
    const started = process.hrtime.bigint();
    const invoked = invokeArmRunner({
      runnerPath,
      request,
      budgetConfirmed,
      baselineAttested,
      timeoutMs: runnerTimeoutMs,
    });
    const wallClockMs = Number(process.hrtime.bigint() - started) / 1e6;
    mergeUsage(usage, invoked.response.usage);
    calls.push({
      phase,
      wall_clock_ms: wallClockMs,
      usage: invoked.response.usage,
      final_message: typeof invoked.response.final_message === 'string'
        ? invoked.response.final_message
        : '',
      provider: invoked.response.provider || (simulation ? 'offline-simulation' : 'unknown'),
      model: invoked.response.model || model,
      stderr: invoked.stderr,
    });
  };

  try {
    let loopStatus = null;
    const armStarted = process.hrtime.bigint();
    if (arm.verifiedLoop) {
      const authority = createLoopAuthority(
        task,
        solutionDirectory,
        stateRoot,
      );
      const outcome = await runVerifiedCompletionLoop({
        runDirectory: authority.runDirectory,
        oracle: authority.oracle,
        env: {
          [VERIFIED_LOOP_ENV]: VERIFIED_LOOP_ENABLED_VALUE,
        },
        budgets: DEFAULT_BUDGETS,
        act: async () => callRunner('generation'),
        repair: async () => callRunner('repair'),
      });
      loopStatus = outcome.status;
      invariant(
        outcome.status === 'criterion-complete',
        `${task.id}/${armId}: verified loop ended ${outcome.status}`,
      );
    } else {
      await callRunner('generation');
    }
    const wallClockMs = Number(process.hrtime.bigint() - armStarted) / 1e6;
    const archivedWorkspace = path.join(outputRoot, 'solutions', armId, task.id);
    mkdirSync(path.dirname(archivedWorkspace), { recursive: true });
    cpSync(workspaceDirectory, archivedWorkspace, { recursive: true });
    const meta = {
      task: task.id,
      arm: armId,
      label: arm.label,
      simulation,
      model,
      model_calls: calls.length,
      loop_status: loopStatus,
      usage,
      wall_clock_ms: wallClockMs,
      fixture_sha256: fixtureHash,
    };
    writeArchiveRow(archiveRoot, task.id, armId, meta, calls);
    return meta;
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    if (stateRoot) rmSync(stateRoot, { recursive: true, force: true });
  }
}

function lintResults(resultsPath) {
  const lint = spawnSync(process.execPath, [PREREG_LINT, `--results=${resultsPath}`], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  if (lint.error || lint.signal || lint.status !== 0) {
    throw new Error(
      `prereg results lint failed: ${String(lint.stderr || lint.stdout || lint.error?.message || '').trim()}`,
    );
  }
  return String(lint.stdout || '').trim();
}

export async function runExperiment({
  budgetConfirmed,
  armRunner,
  simulation = false,
  outDirectory = path.join(DIR, 'out'),
  fixtureRoot = FIXTURE_ROOT,
  model = process.env.FABLE_OPUS_MODEL || 'claude-opus-4-8',
  runnerTimeoutMs = DEFAULT_RUNNER_TIMEOUT_MS,
} = {}) {
  const budgetRef = typeof budgetConfirmed === 'string' ? budgetConfirmed.trim() : '';
  invariant(
    budgetRef,
    'budget-confirmation precondition failed before arm start: missing --budget-confirmed=<attestation-ref>',
  );
  if (armRunner && !simulation) {
    throw new Error('an injected --arm-runner is simulation-only; add --simulation');
  }
  if (simulation && !armRunner) {
    throw new Error('--simulation requires an explicit --arm-runner=<offline-shim>');
  }

  const prereg = loadPrereg();
  const fixture = discoverFixture(fixtureRoot);
  invariant(fixture.tasks.length === prereg.task_n, 'fixture task count does not match prereg task_n');
  const fixtureHash = registeredFixtureHash(fixtureRoot);
  const totalOracles = fixture.tasks.reduce((sum, task) => sum + task.checks.length, 0);
  invariant(totalOracles === 12, `expected 12 frozen executable oracles, found ${totalOracles}`);

  const baselineAttested = simulation ? false : validateBaselineAttestation(fixture.tasks);
  const runnerPath = armRunner ? path.resolve(armRunner) : DEFAULT_ARM_RUNNER;
  invariant(existsSync(runnerPath), `arm runner does not exist: ${runnerPath}`);
  invariant(lstatSync(runnerPath).isFile(), `arm runner is not a regular file: ${runnerPath}`);

  // Capture once after every hard precondition, immediately before any output write or arm start.
  // A simulation uses a clearly labelled synthetic post-registration timestamp only to exercise
  // the structural prereg lint. A live run may never back-date around the prereg clock.
  const firstRunAt = simulation
    ? afterRegistrationTimestamp(prereg)
    : new Date().toISOString();
  if (!simulation) {
    invariant(
      Date.parse(prereg.registered_at) < Date.parse(firstRunAt),
      'real Opus run precondition failed before arm start: system time is not after prereg registered_at',
    );
  }
  const outputRoot = path.resolve(outDirectory);
  ensureFreshOutput(outputRoot);
  const archiveRoot = path.join(outputRoot, 'archive');
  mkdirSync(archiveRoot, { recursive: true });

  try {
    for (const task of fixture.tasks) {
      for (const armId of ARM_IDS) {
        await executeTaskArm({
          task,
          armId,
          outputRoot,
          archiveRoot,
          runnerPath,
          model,
          budgetConfirmed: budgetRef,
          baselineAttested,
          fixtureHash,
          simulation,
          runnerTimeoutMs,
        });
      }
    }

    const scores = {};
    for (const armId of ARM_IDS) {
      scores[armId] = scoreFixtureSolutions(
        path.join(outputRoot, 'solutions', armId),
        {
          fixtureRoot,
          solutionSubdirectory: 'scaffold',
        },
      );
    }
    const costReport = buildCostReport(archiveRoot);
    invariant(costReport.total_runs === fixture.tasks.length * ARM_IDS.length, 'cost report run count is incomplete');
    invariant(
      ARM_IDS.every(arm => costReport.perArm[arm]?.runs === fixture.tasks.length),
      'cost report is missing a complete arm',
    );
    const results = {
      experiment_id: EXPERIMENT_ID,
      first_run_at: firstRunAt,
      simulation,
      fixture_sha256: fixtureHash,
      prereg_path: portableRelative(REPO, PREREG_PATH),
      budget_confirmation_sha256: sha256(budgetRef),
      arm_order: ARM_IDS,
      task_order: fixture.tasks.map(task => task.id),
      scores,
      cost_report: costReport,
    };
    const resultsMarkdown = renderResultsMarkdown({
      firstRunAt,
      fixtureHash,
      scores,
      costReport,
      simulation,
    });
    const resultsJsonPath = path.join(outputRoot, 'results.json');
    const resultsMarkdownPath = path.join(outputRoot, 'RESULTS.md');
    writeFileSync(resultsJsonPath, `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(resultsMarkdownPath, resultsMarkdown);
    const preregLint = lintResults(resultsMarkdownPath);
    return {
      ...results,
      results_json: resultsJsonPath,
      results_markdown: resultsMarkdownPath,
      prereg_lint: preregLint,
    };
  } catch (error) {
    if (simulation) {
      // Simulation artifacts are disposable and must not leave a partial archive
      // that resembles a completed A/B result.
      rmSync(outputRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

function parseArgs(argv) {
  const has = flag => argv.includes(flag);
  const value = (name, fallback = '') => {
    const prefix = `--${name}=`;
    const found = argv.find(argument => argument.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };
  return {
    dryRun: has('--dry-run'),
    json: has('--json'),
    simulation: has('--simulation'),
    budgetConfirmed: value('budget-confirmed'),
    armRunner: value('arm-runner'),
    outDirectory: value('out', path.join(DIR, 'out')),
    model: value('model', process.env.FABLE_OPUS_MODEL || 'claude-opus-4-8'),
    runnerTimeoutMs: Number(value('runner-timeout-ms', String(DEFAULT_RUNNER_TIMEOUT_MS))),
  };
}

function printDryRunText(plan) {
  process.stdout.write(
    `[dry-run] verified-loop-ab — ${plan.total_runs} planned runs `
    + `(${plan.task_count} tasks × ${plan.arms.length} arms)\n`,
  );
  for (const arm of plan.arms) {
    process.stdout.write(`  arm ${arm.id}: ${arm.description}\n`);
  }
  process.stdout.write(`  tasks: ${plan.tasks.join(', ')}\n`);
  process.stdout.write(
    `  scoring: ${plan.scoring.primary_metric} `
    + `(${plan.scoring.oracle_count} hidden executable oracles; exit 0 = PASS)\n`,
  );
  process.stdout.write(`  cost fields: ${plan.cost_report.fields_per_arm.join(', ')}\n`);
  process.stdout.write(`  prereg: ${plan.prereg.experiment_id}\n`);
  process.stdout.write(
    '  [dry-run] OFFLINE: no model calls, no token spend, no network, no writes.\n',
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.dryRun) {
    const plan = buildDryRunPlan();
    if (options.json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    else printDryRunText(plan);
    return;
  }

  // The checked budget gate is intentionally the first non-dry action.
  if (!options.budgetConfirmed.trim()) {
    throw new Error(
      'budget-confirmation precondition failed before arm start: '
      + 'missing --budget-confirmed=<attestation-ref>',
    );
  }
  invariant(
    Number.isInteger(options.runnerTimeoutMs) && options.runnerTimeoutMs >= 1,
    '--runner-timeout-ms must be a positive integer',
  );
  const results = await runExperiment(options);
  if (options.json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  else {
    process.stdout.write(
      `${results.simulation ? 'Offline simulation' : 'Experiment'} wrote `
      + `${results.cost_report.total_runs} task-arm rows to `
      + `${path.dirname(results.results_markdown)}\n`,
    );
    process.stdout.write(`${results.prereg_lint}\n`);
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    process.stderr.write(`verified-loop-ab: ${error.message}\n`);
    process.exitCode = 2;
  });
}
