#!/usr/bin/env node
// G3.5 bidirectional oracle for the opt-in bounded verified-completion loop.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
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
import {
  PLAN_TRIGGER,
  writePlanArtifact,
} from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  createRun,
  loadRunState,
  readRunLedger,
} from '../orchestration/lib/run-state.mjs';
import {
  VERIFIED_LOOP_ENABLED_VALUE,
  VERIFIED_LOOP_ENV,
  VERIFIED_LOOP_STATES,
  defineExecutableOracle,
  runVerifiedCompletionLoop,
} from '../orchestration/lib/verified-loop.mjs';

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + error.message);
  }
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enabledEnv = Object.freeze({
  [VERIFIED_LOOP_ENV]: VERIFIED_LOOP_ENABLED_VALUE,
});

function clock(seed) {
  let tick = 0;
  const base = Date.UTC(2026, 6, 17, 3, 0, seed);
  return () => new Date(base + tick++).toISOString();
}

function recursiveFiles(entry) {
  const absolute = path.join(REPO, entry);
  if (!existsSync(absolute)) return [];
  const metadata = lstatSync(absolute);
  if (metadata.isFile()) return [absolute];
  const files = [];
  for (const child of readdirSync(absolute, { withFileTypes: true })) {
    const childPath = path.join(absolute, child.name);
    if (child.isDirectory()) {
      files.push(...recursiveFiles(path.relative(REPO, childPath)));
    } else if (child.isFile()) {
      files.push(childPath);
    }
  }
  return files;
}

function eventPayloads(runDirectory, type) {
  return readRunLedger(runDirectory)
    .filter(event => event.type === type)
    .map(event => event.payload);
}

function criterionState(runDirectory) {
  return loadRunState(runDirectory).criteria[0];
}

console.log('bounded verified-completion loop (G3.5):');

const root = mkdtempSync(path.join(tmpdir(), 'fable-verified-loop-'));
try {
  const fixtureDirectory = path.join(root, 'fixture');
  mkdirSync(fixtureDirectory, { recursive: true });
  const actorScript = path.join(fixtureDirectory, 'actor.mjs');
  const oracleScript = path.join(fixtureDirectory, 'oracle.mjs');
  const timeoutOracleScript = path.join(fixtureDirectory, 'timeout-oracle.mjs');
  const criterionDescription = 'The solution file contains the exact good value and the executable oracle exits zero.';
  writeFileSync(actorScript, [
    "import { writeFileSync } from 'node:fs';",
    'const [target, value] = process.argv.slice(2);',
    "if (!target || !value) process.exit(2);",
    "writeFileSync(target, `${value}\\n`);",
    '',
  ].join('\n'));
  writeFileSync(oracleScript, [
    "import { readFileSync } from 'node:fs';",
    "import path from 'node:path';",
    'const [workspace] = process.argv.slice(2);',
    "if (!workspace) process.exit(2);",
    "let value = '';",
    "try { value = readFileSync(path.join(workspace, 'solution.txt'), 'utf8'); }",
    "catch { process.stderr.write('solution missing\\n'); process.exit(1); }",
    "if (value === 'good\\n') { process.stdout.write('PASS\\n'); process.exit(0); }",
    "process.stderr.write(`expected good, received ${JSON.stringify(value)}\\n`);",
    'process.exit(1);',
    '',
  ].join('\n'));
  writeFileSync(timeoutOracleScript, [
    'setInterval(() => {}, 1_000);',
    '',
  ].join('\n'));

  const projectRoot = path.join(root, 'project');
  mkdirSync(projectRoot, { recursive: true });
  const plan = writePlanArtifact(
    projectRoot,
    'verified-loop-fixture',
    {
      title: 'Verified-loop fixture criteria',
      outcome: 'Executable evidence, not prose, decides the fixture criterion.',
      scope: {
        in: ['One selected criterion, one target file, and its executable oracle.'],
        out: ['Default runtime integration and non-executable judgment.'],
      },
      criteria: [
        `[criterion.solution] ${criterionDescription}`,
      ],
      orderedDependencies: [
        'Create the run contract from the decision criterion.',
        'Execute the bound oracle and record its receipt.',
      ],
      riskyAssumptions: [
        'The fixture actor stands in for a model action without making a model call.',
      ],
      nonGoals: [
        'Use prose, judge preference, or critique as a completion or retry signal.',
      ],
    },
    { trigger: PLAN_TRIGGER },
  );

  function createFixture(name, {
    command = process.execPath,
    script = oracleScript,
    args,
    timeoutMs = 10_000,
    targetPaths = ['solution.txt'],
    criteria = [
      {
        id: 'criterion.solution',
        description: criterionDescription,
      },
    ],
    scopeInclude = ['solution.txt'],
    bindPlan = true,
  } = {}) {
    const workspace = path.join(root, 'workspaces', name);
    const runDirectory = path.join(root, 'runs', name);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(workspace, 'solution.txt'), 'unset\n');
    const oracle = defineExecutableOracle({
      checkId: 'check.solution',
      command,
      args: args ?? [script, workspace],
      cwd: workspace,
      timeoutMs,
      sourceRoot: fixtureDirectory,
      sourcePaths: [path.relative(fixtureDirectory, script)],
      targetRoot: workspace,
      targetPaths,
    });
    createRun(
      runDirectory,
      {
        schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
        runId: `g3.5-${name}`,
        goal: 'Complete the selected criterion only through executable evidence.',
        criteria,
        scope: {
          include: scopeInclude,
          exclude: ['default runtime paths', 'judge-controlled retry'],
        },
        allowedActions: [
          'run one generation action',
          'run the bound executable oracle',
          'run FAIL-anchored repair within budget',
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
        ...(bindPlan ? { planPath: plan.path, planHash: plan.sha256 } : {}),
      },
      { timestamp: clock(0)() },
    );
    return Object.freeze({ workspace, runDirectory, oracle });
  }

  function runActor(workspace, value) {
    const target = path.join(workspace, 'solution.txt');
    const execution = spawnSync(
      process.execPath,
      [actorScript, target, value],
      { encoding: 'utf8' },
    );
    assert.equal(execution.status, 0, execution.stderr);
  }

  // (f) Default-off is behavioral, not just a source comment.
  await check('missing or wrong opt-in flags perform zero action and append zero ledger bytes', async () => {
    for (const [suffix, env] of [
      ['missing', {}],
      ['wrong', { [VERIFIED_LOOP_ENV]: 'true' }],
    ]) {
      const fixture = createFixture(`default-off-${suffix}`);
      const ledgerPath = path.join(fixture.runDirectory, RUN_FILES.ledger);
      const beforeLedger = readFileSync(ledgerPath, 'utf8');
      const beforeTarget = readFileSync(path.join(fixture.workspace, 'solution.txt'), 'utf8');
      let callbacks = 0;
      const outcome = await runVerifiedCompletionLoop({
        runDirectory: fixture.runDirectory,
        oracle: fixture.oracle,
        env,
        act() {
          callbacks++;
          throw new Error('default-off act must not run');
        },
        repair() {
          callbacks++;
          throw new Error('default-off repair must not run');
        },
      });
      assert.equal(outcome.status, 'disabled');
      assert.equal(outcome.state, VERIFIED_LOOP_STATES.DISABLED);
      assert.equal(callbacks, 0);
      assert.equal(readFileSync(ledgerPath, 'utf8'), beforeLedger);
      assert.equal(
        readFileSync(path.join(fixture.workspace, 'solution.txt'), 'utf8'),
        beforeTarget,
      );
    }
  });

  await check('non-atomic criteria must match the bound G3.3 plan before any action', async () => {
    for (const [suffix, options, message] of [
      [
        'planless',
        { bindPlan: false },
        /requires a contract-bound G3\.3 plan/,
      ],
      [
        'plan-mismatch',
        {
          criteria: [
            {
              id: 'criterion.solution',
              description: 'A contract-only criterion not present in the plan.',
            },
          ],
        },
        /description does not match/,
      ],
    ]) {
      const fixture = createFixture(`criteria-${suffix}`, options);
      let actCalls = 0;
      await assert.rejects(
        () => runVerifiedCompletionLoop({
          runDirectory: fixture.runDirectory,
          oracle: fixture.oracle,
          env: enabledEnv,
          act() {
            actCalls++;
          },
        }),
        message,
      );
      assert.equal(actCalls, 0);
      assert.equal(criterionState(fixture.runDirectory).attemptIds.length, 0);
    }
  });

  // (a) Model prose cannot repair completion; the real nonzero oracle keeps it open.
  await check('a seeded model done-claim without oracle PASS leaves the criterion open', async () => {
    const fixture = createFixture('fake-done');
    let actCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(1),
      act() {
        actCalls++;
        runActor(fixture.workspace, 'bad');
        return {
          done: true,
          modelClaim: 'I am done.',
        };
      },
    });
    assert.equal(actCalls, 1);
    assert.equal(outcome.status, 'repair-required');
    assert.equal(outcome.state, VERIFIED_LOOP_STATES.REPAIR_READY);
    assert.equal(criterionState(fixture.runDirectory).status, 'open');
    assert.equal(
      eventPayloads(fixture.runDirectory, RUN_EVENT_TYPES.CRITERION_COMPLETED).length,
      0,
    );
    const evidence = eventPayloads(
      fixture.runDirectory,
      RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    );
    assert.deepEqual(evidence.map(entry => entry.receipt.result), ['fail']);
  });

  await check('an action cannot rewrite the bound oracle into a false PASS', async () => {
    const mutableOracle = path.join(fixtureDirectory, 'mutable-oracle.mjs');
    writeFileSync(mutableOracle, readFileSync(oracleScript));
    const fixture = createFixture('oracle-identity', { script: mutableOracle });
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(9),
      act() {
        runActor(fixture.workspace, 'bad');
        writeFileSync(mutableOracle, 'process.exit(0);\n');
      },
      repair() {
        throw new Error('mutated oracle identity must not authorize repair');
      },
    });
    assert.equal(outcome.status, 'oracle-error');
    assert.equal(outcome.artifact.identityVerified, false);
    assert.match(outcome.artifact.error.message, /source bytes changed/);
    assert.equal(criterionState(fixture.runDirectory).status, 'open');
    assert.equal(
      eventPayloads(fixture.runDirectory, RUN_EVENT_TYPES.CRITERION_COMPLETED).length,
      0,
    );
    assert.equal(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).length,
      0,
    );
  });

  // (b) The only retry edge is FAIL; the repair callback is not a second generation.
  await check('executable FAIL triggers one anchored repair and PASS stops immediately', async () => {
    const fixture = createFixture('fail-repair-pass');
    const modes = [];
    let actCalls = 0;
    let repairCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(2),
      act(context) {
        actCalls++;
        modes.push(context.mode);
        assert.equal(context.generationRound, 1);
        runActor(fixture.workspace, 'bad');
      },
      repair(context) {
        repairCalls++;
        modes.push(context.mode);
        assert.equal(context.generationRound, 1);
        assert.equal(context.failure.receipt.result, 'fail');
        assert.equal(context.failure.artifact.outcome, 'fail');
        assert.notEqual(context.failure.artifact.status, 0);
        assert.equal(context.failure.artifact.error, null);
        assert.equal(context.failure.artifact.signal, null);
        runActor(fixture.workspace, 'good');
      },
    });

    assert.equal(outcome.status, 'criterion-complete');
    assert.equal(outcome.state, VERIFIED_LOOP_STATES.COMPLETED);
    assert.equal(actCalls, 1);
    assert.equal(repairCalls, 1);
    assert.deepEqual(modes, ['generation', 'repair']);
    assert.deepEqual(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).map(entry => entry.receipt.result),
      ['fail', 'pass'],
    );
    assert.equal(criterionState(fixture.runDirectory).attemptIds.length, 2);
    assert.equal(outcome.checkpoint.complete, true);
    assert.equal(outcome.budget.consumed.genRoundCap, 1);
    assert.equal(outcome.budget.consumed.verifiedLoopCap, 2);
  });

  await check('an initial executable PASS stops with no repair or extra oracle cycle', async () => {
    const fixture = createFixture('pass-stop');
    let repairCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(3),
      act() {
        runActor(fixture.workspace, 'good');
      },
      repair() {
        repairCalls++;
        throw new Error('PASS must stop before repair');
      },
    });
    assert.equal(outcome.status, 'criterion-complete');
    assert.equal(repairCalls, 0);
    assert.deepEqual(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).map(entry => entry.receipt.result),
      ['pass'],
    );
    assert.equal(criterionState(fixture.runDirectory).attemptIds.length, 1);
    assert.equal(outcome.budget.consumed.verifiedLoopCap, 1);
    assert.equal(
      outcome.history.includes(VERIFIED_LOOP_STATES.REPAIRING),
      false,
    );
  });

  // (c) Default cap 2 = initial cycle + one repair; cap+1 writes debt before halt.
  await check('verified-loop cap exhaustion surfaces and records open debt before terminal halt', async () => {
    const fixture = createFixture('cap-exhaustion');
    let repairCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(4),
      act() {
        runActor(fixture.workspace, 'bad');
      },
      repair(context) {
        repairCalls++;
        assert.equal(context.failure.receipt.result, 'fail');
        runActor(fixture.workspace, 'still-bad');
      },
    });

    assert.equal(outcome.status, 'halted-cap-exhausted');
    assert.equal(outcome.state, VERIFIED_LOOP_STATES.HALTED);
    assert.equal(outcome.report.audience, 'human');
    assert.equal(outcome.report.reason, 'budget-exhausted');
    assert.equal(outcome.report.cap, 2);
    assert.equal(repairCalls, 1);
    const state = loadRunState(fixture.runDirectory);
    assert.equal(state.halted, true);
    assert.equal(state.complete, false);
    assert.equal(state.debt.open.length, 1);
    assert.equal(state.debt.open[0].criterionId, 'criterion.solution');
    assert.equal(state.debt.open[0].id, outcome.report.debtId);
    const events = readRunLedger(fixture.runDirectory);
    assert.deepEqual(events.slice(-2).map(event => event.type), [
      RUN_EVENT_TYPES.DEBT_ADDED,
      RUN_EVENT_TYPES.RUN_HALTED,
    ]);
    assert.deepEqual(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).map(entry => entry.receipt.result),
      ['fail', 'fail'],
    );
    assert.equal(outcome.budget.budgets.verifiedLoopCap, 2);
    assert.equal(outcome.budget.budgets.verifiedLoopHardMax, 3);
  });

  // (d, N9) Judge/critique output is accepted as inert callback prose only.
  await check('judge or critique wants-retry output cannot trigger repair without executable FAIL', async () => {
    const fixture = createFixture('judge-cannot-retry');
    let repairCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      env: enabledEnv,
      now: clock(5),
      judgeOutput: { preference: 'retry', wantsRetry: true },
      critiqueOutput: { verdict: 'try again', wantsRetry: true },
      act() {
        runActor(fixture.workspace, 'good');
        return {
          modelClaim: 'done',
          judge: { wantsRetry: true },
          critique: { wantsRetry: true },
        };
      },
      repair() {
        repairCalls++;
        throw new Error('non-executable judgment must not reach repair');
      },
    });
    assert.equal(outcome.status, 'criterion-complete');
    assert.equal(repairCalls, 0);
    assert.deepEqual(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).map(entry => entry.receipt.result),
      ['pass'],
    );
  });

  // (e, N6) Oracle errors and tampered FAIL artifacts cannot anchor repair.
  await check('retry without a captured executable FAIL artifact is refused before repair runs', async () => {
    const errorFixture = createFixture('missing-fail-anchor', {
      script: timeoutOracleScript,
      timeoutMs: 25,
    });
    let actCalls = 0;
    let repairCalls = 0;
    const first = await runVerifiedCompletionLoop({
      runDirectory: errorFixture.runDirectory,
      oracle: errorFixture.oracle,
      env: enabledEnv,
      now: clock(6),
      act() {
        actCalls++;
        runActor(errorFixture.workspace, 'bad');
      },
      repair() {
        repairCalls++;
        throw new Error('oracle execution error must not authorize repair');
      },
    });
    assert.equal(first.status, 'oracle-error');
    assert.equal(first.state, VERIFIED_LOOP_STATES.ORACLE_ERROR);
    assert.equal(first.artifact.outcome, 'error');
    assert.notEqual(first.artifact.error, null);
    assert.equal(actCalls, 1);
    assert.equal(repairCalls, 0);
    assert.equal(
      eventPayloads(
        errorFixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).length,
      0,
    );
    assert.equal(criterionState(errorFixture.runDirectory).status, 'open');

    const tamperedFixture = createFixture('tampered-fail-anchor');
    const tampered = await runVerifiedCompletionLoop({
      runDirectory: tamperedFixture.runDirectory,
      oracle: tamperedFixture.oracle,
      env: enabledEnv,
      now: clock(7),
      act() {
        actCalls++;
        runActor(tamperedFixture.workspace, 'bad');
      },
      repair() {
        repairCalls++;
        throw new Error('tampered FAIL artifact must be refused before repair');
      },
      checkpoint({ receipt }) {
        if (receipt.result === 'fail') {
          writeFileSync(
            path.join(tamperedFixture.runDirectory, receipt.artifact.path),
            '{"tampered":true}\n',
          );
        }
      },
    });
    assert.equal(tampered.status, 'repair-refused');
    assert.equal(tampered.state, VERIFIED_LOOP_STATES.REPAIR_REFUSED);
    assert.equal(tampered.report.reason, 'missing-executable-fail-anchor');
    assert.match(tampered.report.message, /digest mismatch/);
    assert.equal(actCalls, 2);
    assert.equal(repairCalls, 0);
  });

  // (f) Atomic one-file work keeps the executable gate but bypasses loop ceremony.
  await check('atomic single-file work stops after its first valid evidence with no loop/verifier/resume', async () => {
    const fixture = createFixture('atomic-shortcut');
    let actCalls = 0;
    let repairCalls = 0;
    let verifierCalls = 0;
    let resumeCalls = 0;
    const outcome = await runVerifiedCompletionLoop({
      runDirectory: fixture.runDirectory,
      oracle: fixture.oracle,
      task: { atomicSingleFile: true },
      env: enabledEnv,
      now: clock(8),
      act(context) {
        actCalls++;
        assert.equal(context.mode, 'generation');
        runActor(fixture.workspace, 'good');
      },
      repair() {
        repairCalls++;
        throw new Error('atomic shortcut must not repair');
      },
      verifier() {
        verifierCalls++;
        throw new Error('atomic shortcut must not invoke an optional verifier');
      },
      resume() {
        resumeCalls++;
        throw new Error('atomic shortcut must not enter resume ceremony');
      },
    });

    assert.equal(outcome.status, 'atomic-evidence-stop');
    assert.equal(outcome.state, VERIFIED_LOOP_STATES.ATOMIC_EVIDENCE_STOP);
    assert.equal(outcome.checkpoint.complete, true);
    assert.equal(actCalls, 1);
    assert.equal(repairCalls, 0);
    assert.equal(verifierCalls, 0);
    assert.equal(resumeCalls, 0);
    assert.equal(outcome.budget.consumed.genRoundCap, 1);
    assert.equal(outcome.budget.consumed.verifiedLoopCap, 0);
    assert.equal(criterionState(fixture.runDirectory).attemptIds.length, 1);
    assert.deepEqual(
      eventPayloads(
        fixture.runDirectory,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      ).map(entry => entry.receipt.result),
      ['pass'],
    );
    assert.equal(
      outcome.history.includes(VERIFIED_LOOP_STATES.REPAIR_READY),
      false,
    );
    assert.equal(
      outcome.history.includes(VERIFIED_LOOP_STATES.REPAIRING),
      false,
    );
  });

  await check('atomic shortcut rejects directory scope and multi-criterion tasks before action', async () => {
    const invalidFixtures = [
      createFixture('atomic-directory', {
        targetPaths: ['.'],
        scopeInclude: ['.'],
      }),
      createFixture('atomic-multi-criterion', {
        criteria: [
          {
            id: 'criterion.solution',
            description: criterionDescription,
          },
          {
            id: 'criterion.second',
            description: 'A second criterion makes the task non-atomic.',
          },
        ],
        scopeInclude: ['solution.txt', 'second.txt'],
      }),
    ];
    for (const fixture of invalidFixtures) {
      let actCalls = 0;
      await assert.rejects(
        () => runVerifiedCompletionLoop({
          runDirectory: fixture.runDirectory,
          oracle: fixture.oracle,
          task: { atomicSingleFile: true },
          env: enabledEnv,
          act() {
            actCalls++;
          },
        }),
        /atomic/i,
      );
      assert.equal(actCalls, 0);
      assert.equal(criterionState(fixture.runDirectory).attemptIds.length, 0);
    }
  });

  await check('default/always paths do not invoke the verified loop and default install excludes its module', () => {
    const alwaysRuntimeSurfaces = [
      'profiles',
      'claude-code/output-styles',
      'claude-code/subagent-brief.md',
      'claude-code/agents',
      'claude-code/hooks',
      'codex/AGENTS.fable.md',
      'codex/hooks',
      'mcp/src',
      'fusion',
      'orchestration/recipes',
    ];
    const forbidden = /verified-loop\.mjs|runVerifiedCompletionLoop|FABLE_VERIFIED_LOOP/;
    for (const file of alwaysRuntimeSurfaces.flatMap(recursiveFiles)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        forbidden,
        path.relative(REPO, file),
      );
    }

    // Installers may name the opt-in flag and module solely to omit that module
    // from the default runtime copy. They still must not import or invoke it.
    const nodeInstaller = readFileSync(path.join(REPO, 'install.mjs'), 'utf8');
    const shellInstaller = readFileSync(path.join(REPO, 'install.sh'), 'utf8');
    for (const [name, source] of [
      ['install.mjs', nodeInstaller],
      ['install.sh', shellInstaller],
    ]) {
      assert.doesNotMatch(source, /runVerifiedCompletionLoop/, name);
      assert.equal((source.match(/FABLE_VERIFIED_LOOP/g) || []).length, 1, name);
      assert.equal((source.match(/verified-loop\.mjs/g) || []).length, 1, name);
    }
    assert.match(nodeInstaller, /process\.env\.FABLE_VERIFIED_LOOP,\n/, 'install.mjs flag selector');
    assert.match(
      nodeInstaller,
      /  'orchestration\/lib\/verified-loop\.mjs',\n/,
      'install.mjs opt-in removal list',
    );
    assert.match(
      shellInstaller,
      /upgrade_runtime_value_enabled "\$\{FABLE_VERIFIED_LOOP:-\}" \\\n/,
      'install.sh flag selector',
    );
    assert.match(
      shellInstaller,
      /      "\$RUNTIME_DIR\/orchestration\/lib\/verified-loop\.mjs" \\\n/,
      'install.sh opt-in removal list',
    );

    const home = path.join(root, 'default-install-home');
    mkdirSync(home, { recursive: true });
    const env = {
      PATH: process.env.PATH || '',
      HOME: home,
      USERPROFILE: home,
      CI: '1',
      LANG: 'C',
      LC_ALL: 'C',
    };
    if (process.platform === 'win32') {
      if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
    }
    const install = spawnSync(process.execPath, [
      path.join(REPO, 'install.mjs'),
      '--no-mcp',
      '--no-subagent',
      '--no-onboard',
      '--no-modelcheck',
      '--no-skills',
    ], {
      cwd: REPO,
      env,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.equal(
      existsSync(path.join(
        home,
        '.claude',
        'fable-profile',
        'runtime',
        'orchestration',
        'lib',
        'verified-loop.mjs',
      )),
      false,
    );

    const moduleSource = readFileSync(
      path.join(REPO, 'orchestration/lib/verified-loop.mjs'),
      'utf8',
    );
    assert.doesNotMatch(moduleSource, /readonly-verifiers\.mjs|continuation\.mjs|fable-handoff/);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
