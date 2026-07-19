#!/usr/bin/env node
// G4.3 bidirectional oracle for progress-aware two-strike continuation.
import assert from 'node:assert/strict';
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
import { DEFAULT_BUDGETS } from '../orchestration/lib/budget.mjs';
import {
  CONTINUATION_INVARIANTS,
  CONTINUATION_PROGRESS_EVENT_TYPES,
  CONTINUATION_STOP_REASONS,
  NO_PROGRESS_STRIKE_LIMIT,
  PROGRESS_CONTINUATION_ENABLED_VALUE,
  PROGRESS_CONTINUATION_ENV,
  deriveContinuationProgress,
  handleProgressAwareStop,
} from '../orchestration/lib/continuation.mjs';
import { inspectPlanArtifact } from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  RUN_WRITE_BOUNDARIES,
  appendRunEvent,
  completeCriterion,
  createEvidenceReceipt,
  createRun,
  loadRunState,
  readRunLedger,
  rebindRunPlan,
  recordCriterionEvidence,
  startCriterionAttempt,
} from '../orchestration/lib/run-state.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enabledEnv = Object.freeze({
  [PROGRESS_CONTINUATION_ENV]: PROGRESS_CONTINUATION_ENABLED_VALUE,
});
const ownerDecision = Object.freeze({
  id: 'owner.choose-recovery',
  description: 'Owner must choose the exact recovery path before automatic work resumes.',
});

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

let clockTick = 0;
function now() {
  const base = Date.UTC(2026, 6, 17, 6, 0, 0);
  return new Date(base + clockTick++ * 1_000).toISOString();
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

function fixtureCriteria(count = 2) {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    id: `criterion.${index + 1}`,
    description: index === 0
      ? 'The first criterion records genuine executable-style PASS evidence.'
      : 'The next unresolved criterion is named exactly once by continuation.',
  })));
}

function createFixture(root, name, {
  criteria = fixtureCriteria(),
  blockers = [ownerDecision],
  plan = null,
} = {}) {
  const runDirectory = path.join(root, name);
  const contract = Object.freeze({
    schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
    runId: `g4.3-${name}`,
    goal: 'Continue only while the authoritative ledger shows bounded progress.',
    criteria,
    scope: Object.freeze({
      include: Object.freeze([
        'orchestration/lib/continuation.mjs',
        'test/continuation-test.mjs',
      ]),
      exclude: Object.freeze([
        'default stop-gate behavior',
        'caller prose and counters',
        'high-iteration promises',
      ]),
    }),
    allowedActions: Object.freeze([
      'read the authoritative contract and ledger',
      'append one continuation boundary',
      'append one resolvable stuck debt record',
    ]),
    blockers: Object.freeze(blockers),
    checks: Object.freeze(criteria.map(criterion => Object.freeze({
      id: `check.${criterion.id}`,
      criterionId: criterion.id,
      type: 'assertion',
      definition: `fixture assertion for ${criterion.id}`,
    }))),
    ...(plan ? { planPath: plan.path, planHash: plan.sha256 } : {}),
  });
  createRun(runDirectory, contract, { timestamp: now() });
  return Object.freeze({ contract, runDirectory });
}

function fixturePlanContent(label) {
  return `# Plan: continuation churn fixture ${label}

<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->

## Outcome

Keep plan steering ${label} explicit without treating it as criterion progress.

## Scope

### In

- Temporary plan-rebind events.

### Out

- Criterion evidence or completion.

## Criteria

- Plan bookkeeping cannot reset continuation strikes.

## Ordered dependencies

1. Change the bound decision snapshot.
2. Record the exact rebind.

## Risky assumptions

- Each label produces a distinct valid plan hash.

## Non-goals

- Claim criterion-forward work from plan steering.
`;
}

function createFixturePlan(root, name, label = 'initial') {
  const planPath = path.join(root, 'plans', `${name}.md`);
  mkdirSync(path.dirname(planPath), { recursive: true });
  writeFileSync(planPath, fixturePlanContent(label));
  return inspectPlanArtifact(planPath);
}

function completeFixtureCriterion(fixture, criterionId, suffix = 'pass') {
  const { contract, runDirectory } = fixture;
  const attemptId = `attempt.${criterionId}.${suffix}`;
  const receiptId = `receipt.${criterionId}.${suffix}`;
  const targetPath = `targets/${criterionId}.txt`;
  const artifactPath = `artifacts/${receiptId}.txt`;
  mkdirSync(path.join(runDirectory, 'targets'), { recursive: true });
  mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
  writeFileSync(path.join(runDirectory, targetPath), `target:${criterionId}:${suffix}\n`);
  writeFileSync(path.join(runDirectory, artifactPath), `artifact:${receiptId}\n`);
  startCriterionAttempt(
    runDirectory,
    criterionId,
    attemptId,
    { timestamp: now() },
  );
  const checkDefinition = contract.checks.find(
    entry => entry.criterionId === criterionId,
  );
  const receipt = createEvidenceReceipt(runDirectory, {
    id: receiptId,
    criterionId,
    attemptId,
    check: {
      id: checkDefinition.id,
      type: checkDefinition.type,
      definition: checkDefinition.definition,
    },
    result: 'pass',
    recordedAt: now(),
    targetRoot: runDirectory,
    targetPaths: [targetPath],
    artifactPath,
  });
  recordCriterionEvidence(runDirectory, receipt, { timestamp: now() });
  completeCriterion(
    runDirectory,
    criterionId,
    receipt.id,
    { timestamp: now() },
  );
  return Object.freeze({ receipt, targetPath, artifactPath });
}

function ledgerBytes(runDirectory) {
  return readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8');
}

function eventsOfType(runDirectory, type) {
  return readRunLedger(runDirectory).filter(event => event.type === type);
}

console.log('progress-aware two-strike continuation (G4.3):');

const root = mkdtempSync(path.join(tmpdir(), 'fable-continuation-'));
try {
  await check('missing or incorrect opt-in is inert and byte-stable', () => {
    for (const [suffix, env] of [
      ['missing', {}],
      ['wrong', { [PROGRESS_CONTINUATION_ENV]: 'true' }],
    ]) {
      const fixture = createFixture(root, `default-off-${suffix}`);
      const before = ledgerBytes(fixture.runDirectory);
      const result = handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env,
        reason: CONTINUATION_STOP_REASONS.STOP,
      });
      assert.equal(result.enabled, false);
      assert.equal(result.status, 'disabled');
      assert.equal(result.resume, null);
      assert.equal(ledgerBytes(fixture.runDirectory), before);
    }
  });

  await check('prose, cache, resume bookkeeping, and a bare attempt start cannot claim progress', () => {
    assert.deepEqual(CONTINUATION_PROGRESS_EVENT_TYPES, [
      RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      RUN_EVENT_TYPES.CRITERION_COMPLETED,
    ]);
    const fixture = createFixture(root, 'non-progress-controls');
    startCriterionAttempt(
      fixture.runDirectory,
      'criterion.1',
      'attempt.non-progress.1',
      { timestamp: now() },
    );
    writeFileSync(
      path.join(fixture.runDirectory, RUN_FILES.cache),
      '{"advanced":true,"progress":999,"complete":true}\n',
    );
    writeFileSync(
      path.join(fixture.runDirectory, 'model-prose.txt'),
      'I made excellent progress and should continue forever.\n',
    );
    const derived = deriveContinuationProgress(readRunLedger(fixture.runDirectory));
    assert.equal(derived.source, 'ledger');
    assert.equal(derived.advanced, false);
    assert.deepEqual(derived.meaningfulEvents, []);
    assert.equal(derived.prospectiveNoProgressStrikes, 1);

    const first = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-non-progress-1',
    });
    assert.equal(first.status, 'resume-first-no-progress');
    assert.equal(first.progress.advanced, false);
    assert.equal(first.resume.criterionId, 'criterion.1');
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 1);

    const beforeIdempotentRetry = ledgerBytes(fixture.runDirectory);
    const idempotentRetry = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-non-progress-1',
    });
    assert.equal(idempotentRetry.status, 'already-resumed');
    assert.equal(idempotentRetry.action, 'no-op-existing-resume');
    assert.equal(idempotentRetry.resume, null);
    assert.equal(idempotentRetry.autoContinue, false);
    assert.equal(ledgerBytes(fixture.runDirectory), beforeIdempotentRetry);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.DEBT_ADDED,
    ).length, 0);

    const afterResume = deriveContinuationProgress(
      readRunLedger(fixture.runDirectory),
    );
    assert.equal(afterResume.advanced, false);
    assert.equal(afterResume.previousNoProgressStreak, 1);
    assert.deepEqual(afterResume.meaningfulEvents, []);

    assert.equal(
      CONTINUATION_PROGRESS_EVENT_TYPES.includes(
        RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED,
      ),
      false,
    );
    const repeatedDeviation = {
      schemaVersion: 1,
      sequence: afterResume.latestSequence + 1,
      timestamp: now(),
      type: RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED,
      payload: {
        boundHash: 'a'.repeat(64),
        observedHash: 'b'.repeat(64),
        reason: 'repeatable audit-only deviation',
      },
    };
    const afterDeviation = deriveContinuationProgress([
      ...readRunLedger(fixture.runDirectory),
      repeatedDeviation,
    ]);
    assert.equal(afterDeviation.advanced, false);
    assert.deepEqual(afterDeviation.meaningfulEvents, []);
  });

  await check('an advanced incomplete run receives exactly one concise next-criterion resume', () => {
    const fixture = createFixture(root, 'advanced-one-resume');
    completeFixtureCriterion(fixture, 'criterion.1', 'advanced');
    const beforeState = loadRunState(fixture.runDirectory);
    const beforeResumeCount = eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length;

    const result = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.STOP,
      timestamp: now(),
      resumeToken: 'continuation-advanced-1',
    });

    assert.equal(result.status, 'resume-progress');
    assert.equal(result.action, 'inject-resume');
    assert.equal(result.autoContinue, true);
    assert.equal(result.stopCurrentContext, false);
    assert.equal(result.progress.advanced, true);
    assert.deepEqual(result.criterion, fixture.contract.criteria[1]);
    assert.equal(result.resume.criterionId, 'criterion.2');
    assert.match(result.resume.text, /criterion\.2/);
    assert.match(
      result.resume.text,
      new RegExp(fixture.contract.criteria[1].description.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      )),
    );
    assert.equal(result.resume.text.includes('\n'), false);
    assert.ok(result.resume.text.length <= 240, result.resume.text);

    const resumes = eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    );
    assert.equal(resumes.length, beforeResumeCount + 1);
    assert.deepEqual(resumes.at(-1).payload, {
      resumeToken: 'continuation-advanced-1',
      criterionId: 'criterion.2',
      sourceSequence: beforeState.lastSequence,
    });
    assert.equal(result.resume.eventSequence, beforeState.lastSequence + 1);
    assert.deepEqual(
      result.progress.meaningfulEvents.map(event => event.type),
      [
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
        RUN_EVENT_TYPES.CRITERION_COMPLETED,
      ],
    );
  });

  await check('two consecutive no-progress attempts record one exact stuck blocker and stop auto-continuation', () => {
    const fixture = createFixture(root, 'two-strike');
    completeFixtureCriterion(fixture, 'criterion.1', 'two-strike');
    const advanced = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-two-strike-progress',
    });
    assert.equal(advanced.status, 'resume-progress');

    const firstStrike = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-two-strike-1',
    });
    assert.equal(firstStrike.status, 'resume-first-no-progress');
    assert.equal(firstStrike.progress.prospectiveNoProgressStrikes, 1);
    assert.equal(firstStrike.resume.criterionId, 'criterion.2');

    const secondStrike = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      missingOwnerDecisionId: ownerDecision.id,
    });
    assert.equal(secondStrike.status, 'stuck');
    assert.equal(secondStrike.action, 'stop-auto-continuation');
    assert.equal(secondStrike.autoContinue, false);
    assert.equal(secondStrike.resume, null);
    assert.equal(
      secondStrike.blocker.invariant,
      CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED,
    );
    assert.deepEqual(secondStrike.blocker.missingOwnerDecision, ownerDecision);
    assert.match(
      secondStrike.blocker.description,
      new RegExp(CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED),
    );
    assert.match(secondStrike.blocker.description, /criterion\.2/);
    assert.match(secondStrike.blocker.description, /2 consecutive stop attempts/);
    assert.match(secondStrike.blocker.description, /owner\.choose-recovery/);
    assert.match(
      secondStrike.blocker.description,
      /Owner must choose the exact recovery path/,
    );

    const state = loadRunState(fixture.runDirectory);
    assert.equal(state.halted, false);
    assert.equal(state.complete, false);
    assert.equal(state.debt.open.length, 1);
    assert.equal(state.debt.open[0].id, secondStrike.blocker.id);
    assert.equal(state.debt.open[0].criterionId, 'criterion.2');
    assert.equal(
      state.debt.open[0].description,
      secondStrike.blocker.description,
    );
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 2);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.DEBT_ADDED,
    ).length, 1);

    const stuckBytes = ledgerBytes(fixture.runDirectory);
    for (let attempt = 0; attempt < 12; attempt++) {
      const repeated = handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env: enabledEnv,
        reason: attempt % 2 === 0
          ? CONTINUATION_STOP_REASONS.STOP
          : CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE,
        timestamp: now(),
        resumeToken: `continuation-forbidden-${attempt}`,
      });
      assert.equal(repeated.status, 'stuck');
      assert.equal(repeated.autoContinue, false);
      assert.equal(repeated.resume, null);
      assert.equal(repeated.blocker.id, secondStrike.blocker.id);
      assert.equal(ledgerBytes(fixture.runDirectory), stuckBytes);
    }

    appendRunEvent(
      fixture.runDirectory,
      RUN_EVENT_TYPES.DEBT_RESOLVED,
      {
        debtId: secondStrike.blocker.id,
        boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      },
      { timestamp: now() },
    );
    const afterDebtResolution = deriveContinuationProgress(
      readRunLedger(fixture.runDirectory),
    );
    assert.equal(afterDebtResolution.advanced, false);
    assert.deepEqual(afterDebtResolution.meaningfulEvents, []);
    const afterOwnerResolution = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-after-owner-resolution',
    });
    assert.equal(afterOwnerResolution.status, 'stuck');
    assert.equal(afterOwnerResolution.autoContinue, false);
    assert.equal(afterOwnerResolution.resume, null);
    assert.notEqual(afterOwnerResolution.blocker.id, secondStrike.blocker.id);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 2);
  });

  await check('debt add/resolve churn cannot reset strikes or produce unbounded resumes', () => {
    const fixture = createFixture(root, 'debt-churn');
    const churnDebt = (offset) => {
      for (let cycle = 0; cycle < 10; cycle++) {
        const debtId = `debt.churn.${offset + cycle}`;
        appendRunEvent(
          fixture.runDirectory,
          RUN_EVENT_TYPES.DEBT_ADDED,
          {
            debtId,
            criterionId: 'criterion.1',
            description: `Bookkeeping churn cycle ${offset + cycle}.`,
            boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
          },
          { timestamp: now() },
        );
        appendRunEvent(
          fixture.runDirectory,
          RUN_EVENT_TYPES.DEBT_RESOLVED,
          {
            debtId,
            boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
          },
          { timestamp: now() },
        );
      }
    };

    churnDebt(0);
    const first = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-debt-churn-first',
    });
    assert.equal(first.status, 'resume-first-no-progress');
    assert.equal(first.progress.advanced, false);

    churnDebt(10);
    const second = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
    });
    assert.equal(second.status, 'stuck');
    assert.equal(second.action, 'stop-auto-continuation');
    assert.equal(second.autoContinue, false);
    assert.equal(second.resume, null);
    assert.equal(second.blocker.invariant, CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 1);

    const stuckBytes = ledgerBytes(fixture.runDirectory);
    for (let attempt = 0; attempt < 10; attempt++) {
      const repeated = handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env: enabledEnv,
        timestamp: now(),
        resumeToken: `continuation-debt-churn-forbidden-${attempt}`,
      });
      assert.equal(repeated.status, 'stuck');
      assert.equal(repeated.autoContinue, false);
      assert.equal(ledgerBytes(fixture.runDirectory), stuckBytes);
    }
    assert.equal(loadRunState(fixture.runDirectory).complete, false);
  });

  await check('plan rebind churn cannot reset strikes or produce unbounded resumes', () => {
    const plan = createFixturePlan(root, 'plan-rebind-churn');
    const fixture = createFixture(root, 'plan-rebind-churn', { plan });
    const churnPlan = (offset) => {
      for (let cycle = 0; cycle < 10; cycle++) {
        const label = `rebind-${offset + cycle}`;
        writeFileSync(plan.path, fixturePlanContent(label));
        rebindRunPlan(fixture.runDirectory, {
          reason: `Bookkeeping-only plan churn ${label}.`,
          timestamp: now(),
        });
      }
    };

    churnPlan(0);
    const first = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-plan-churn-first',
    });
    assert.equal(first.status, 'resume-first-no-progress');
    assert.equal(first.progress.advanced, false);

    churnPlan(10);
    const second = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
    });
    assert.equal(second.status, 'stuck');
    assert.equal(second.autoContinue, false);
    assert.equal(second.resume, null);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.PLAN_REBOUND,
    ).length, 20);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 1);

    for (let attempt = 0; attempt < 10; attempt++) {
      const repeated = handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env: enabledEnv,
        timestamp: now(),
        resumeToken: `continuation-plan-churn-forbidden-${attempt}`,
      });
      assert.equal(repeated.status, 'stuck');
      assert.equal(repeated.autoContinue, false);
      assert.equal(repeated.resume, null);
    }
    assert.equal(loadRunState(fixture.runDirectory).complete, false);
  });

  await check('the G2.1 retry cap terminally bounds even genuine-progress resumes', () => {
    const fixture = createFixture(root, 'absolute-cap', {
      criteria: fixtureCriteria(5),
      blockers: [],
    });

    for (let index = 1; index <= DEFAULT_BUDGETS.retryCap; index++) {
      completeFixtureCriterion(
        fixture,
        `criterion.${index}`,
        `absolute-cap-${index}`,
      );
      const withinCap = handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env: enabledEnv,
        timestamp: now(),
        resumeToken: `continuation-absolute-cap-${index}`,
      });
      assert.equal(withinCap.status, 'resume-progress');
      assert.equal(withinCap.autoContinue, true);
      assert.equal(withinCap.resume.criterionId, `criterion.${index + 1}`);
    }

    completeFixtureCriterion(
      fixture,
      `criterion.${DEFAULT_BUDGETS.retryCap + 1}`,
      'absolute-cap-over',
    );
    const exhausted = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-absolute-cap-forbidden',
    });
    assert.equal(exhausted.status, 'halted-cap-exhausted');
    assert.equal(exhausted.action, 'halt-and-surface');
    assert.equal(exhausted.autoContinue, false);
    assert.equal(exhausted.resume, null);
    assert.equal(exhausted.progress.advanced, true);
    assert.equal(exhausted.report.audience, 'human');
    assert.equal(exhausted.report.reason, 'budget-exhausted');
    assert.equal(exhausted.report.invariant, CONTINUATION_INVARIANTS.ATTEMPT_BUDGET);
    assert.equal(exhausted.report.budget, 'retryCap');
    assert.equal(exhausted.report.kind, 'continuation-attempt');
    assert.equal(exhausted.report.cap, DEFAULT_BUDGETS.retryCap);
    assert.equal(exhausted.report.consumed, DEFAULT_BUDGETS.retryCap);
    assert.equal(exhausted.report.attempted, DEFAULT_BUDGETS.retryCap + 1);

    const state = loadRunState(fixture.runDirectory);
    assert.equal(state.halted, true);
    assert.equal(state.complete, false);
    assert.equal(state.resumes.length, DEFAULT_BUDGETS.retryCap);
    assert.equal(state.debt.open.length, 1);
    assert.equal(state.debt.open[0].id, exhausted.report.debtId);
    assert.deepEqual(
      readRunLedger(fixture.runDirectory).slice(-2).map(event => event.type),
      [RUN_EVENT_TYPES.DEBT_ADDED, RUN_EVENT_TYPES.RUN_HALTED],
    );

    const haltedBytes = ledgerBytes(fixture.runDirectory);
    const repeated = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-after-absolute-cap',
    });
    assert.equal(repeated.status, 'already-halted');
    assert.equal(repeated.autoContinue, false);
    assert.equal(ledgerBytes(fixture.runDirectory), haltedBytes);
  });

  await check('context pressure checkpoints for a clean resume but cannot escape the same strike cap', () => {
    const fixture = createFixture(root, 'context-pressure');
    completeFixtureCriterion(fixture, 'criterion.1', 'context-pressure');
    const initial = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE,
      timestamp: now(),
      resumeToken: 'continuation-context-progress',
    });
    assert.equal(initial.status, 'resume-progress');
    assert.equal(initial.action, 'checkpoint-and-clean-resume');
    assert.equal(initial.stopCurrentContext, true);
    assert.equal(initial.resume.criterionId, 'criterion.2');
    assert.deepEqual(initial.checkpoint.openCriteria, ['criterion.2']);

    const firstStrike = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE,
      timestamp: now(),
      resumeToken: 'continuation-context-strike-1',
    });
    assert.equal(firstStrike.status, 'resume-first-no-progress');
    assert.equal(firstStrike.action, 'checkpoint-and-clean-resume');
    assert.equal(firstStrike.stopCurrentContext, true);

    const secondStrike = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE,
      timestamp: now(),
    });
    assert.equal(secondStrike.status, 'stuck');
    assert.equal(secondStrike.resume, null);
    assert.equal(secondStrike.autoContinue, false);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, NO_PROGRESS_STRIKE_LIMIT);
  });

  await check('user abort and abort always bypass resume and preserve ledger bytes', () => {
    const fixture = createFixture(root, 'abort-bypass');
    const before = ledgerBytes(fixture.runDirectory);
    const userAbort = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.USER_ABORT,
      timestamp: now(),
    });
    assert.equal(userAbort.status, 'user-aborted');
    assert.equal(userAbort.resume, null);
    assert.equal(userAbort.autoContinue, false);
    assert.equal(ledgerBytes(fixture.runDirectory), before);

    const abort = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.ABORT,
      timestamp: now(),
    });
    assert.equal(abort.status, 'aborted');
    assert.equal(abort.resume, null);
    assert.equal(abort.autoContinue, false);
    assert.equal(ledgerBytes(fixture.runDirectory), before);
    assert.equal(eventsOfType(
      fixture.runDirectory,
      RUN_EVENT_TYPES.RUN_RESUMED,
    ).length, 0);
  });

  await check('genuine ledger completion always bypasses resume, including under context pressure', () => {
    const fixture = createFixture(root, 'completion-bypass', {
      criteria: fixtureCriteria(1),
      blockers: [],
    });
    completeFixtureCriterion(fixture, 'criterion.1', 'complete');
    assert.equal(loadRunState(fixture.runDirectory).complete, true);
    const before = ledgerBytes(fixture.runDirectory);
    const result = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE,
      timestamp: now(),
      resumeToken: 'continuation-must-not-append',
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.resume, null);
    assert.equal(result.autoContinue, false);
    assert.equal(ledgerBytes(fixture.runDirectory), before);
  });

  await check('a prose completion reason cannot bypass an incomplete authoritative ledger', () => {
    const fixture = createFixture(root, 'false-complete-reason');
    const result = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      reason: CONTINUATION_STOP_REASONS.COMPLETE,
      timestamp: now(),
      resumeToken: 'continuation-false-complete',
    });
    assert.equal(result.status, 'resume-first-no-progress');
    assert.equal(result.resume.criterionId, 'criterion.1');
    assert.equal(result.autoContinue, true);
  });

  await check('freshness-projected stale completion requires explicit reopen and receives no resume', () => {
    const fixture = createFixture(root, 'stale-completion');
    const completion = completeFixtureCriterion(
      fixture,
      'criterion.1',
      'stale',
    );
    writeFileSync(
      path.join(fixture.runDirectory, completion.targetPath),
      'target:criterion.1:changed-after-pass\n',
    );
    const staleState = loadRunState(fixture.runDirectory);
    assert.deepEqual(staleState.openCriteria, ['criterion.1', 'criterion.2']);
    assert.equal(
      staleState.criteria.find(entry => entry.id === 'criterion.1').freshness,
      'stale',
    );
    const before = ledgerBytes(fixture.runDirectory);
    const result = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-stale-forbidden',
    });
    assert.equal(result.status, 'reopen-required');
    assert.equal(
      result.report.reason,
      CONTINUATION_INVARIANTS.COMPLETION_RECEIPT_CURRENT,
    );
    assert.equal(result.resume, null);
    assert.equal(ledgerBytes(fixture.runDirectory), before);
  });

  await check('incomplete state with only open debt cannot invent a criterion resume', () => {
    const fixture = createFixture(root, 'debt-only', {
      criteria: fixtureCriteria(1),
      blockers: [],
    });
    completeFixtureCriterion(fixture, 'criterion.1', 'debt-only');
    appendRunEvent(
      fixture.runDirectory,
      RUN_EVENT_TYPES.DEBT_ADDED,
      {
        debtId: 'debt.external-owner',
        description: 'External owner decision remains unresolved.',
        boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      },
      { timestamp: now() },
    );
    const state = loadRunState(fixture.runDirectory);
    assert.equal(state.complete, false);
    assert.deepEqual(state.openCriteria, []);
    const before = ledgerBytes(fixture.runDirectory);
    const result = handleProgressAwareStop({
      runDirectory: fixture.runDirectory,
      env: enabledEnv,
      timestamp: now(),
    });
    assert.equal(result.status, 'blocked-no-open-criterion');
    assert.equal(
      result.report.reason,
      CONTINUATION_INVARIANTS.OPEN_CRITERION_REQUIRED,
    );
    assert.equal(result.resume, null);
    assert.equal(ledgerBytes(fixture.runDirectory), before);
  });

  await check('caller-supplied progress or strike counters are rejected before ledger mutation', () => {
    const fixture = createFixture(root, 'reject-caller-progress');
    const before = ledgerBytes(fixture.runDirectory);
    assert.throws(
      () => handleProgressAwareStop({
        runDirectory: fixture.runDirectory,
        env: enabledEnv,
        progress: true,
        strikes: 0,
      }),
      /unknown field\(s\): progress, strikes/,
    );
    assert.equal(ledgerBytes(fixture.runDirectory), before);
  });

  await check('stuck blocker identity is canonical and owner decisions cannot be rehydrated ambiguously', () => {
    const spoofed = createFixture(root, 'spoofed-stuck-debt');
    appendRunEvent(
      spoofed.runDirectory,
      RUN_EVENT_TYPES.DEBT_ADDED,
      {
        debtId: 'continuation-stuck-forged',
        criterionId: 'criterion.1',
        description: 'Unrelated debt with a reserved-looking prefix.',
        boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      },
      { timestamp: now() },
    );
    const spoofedBytes = ledgerBytes(spoofed.runDirectory);
    assert.throws(
      () => handleProgressAwareStop({
        runDirectory: spoofed.runDirectory,
        env: enabledEnv,
        timestamp: now(),
      }),
      /does not match the canonical invariant and contract owner-decision record/,
    );
    assert.equal(ledgerBytes(spoofed.runDirectory), spoofedBytes);

    const decisionB = Object.freeze({
      id: 'owner.choose-b',
      description: 'Choose recovery path B.',
    });
    const decisionA = Object.freeze({
      id: 'owner.choose-a',
      description: `Choose recovery path A; quoted text: Missing owner decision ${decisionB.id}: ${decisionB.description}`,
    });
    const ambiguous = createFixture(root, 'canonical-owner-decision', {
      blockers: [decisionA, decisionB],
    });
    completeFixtureCriterion(ambiguous, 'criterion.1', 'canonical-owner');
    handleProgressAwareStop({
      runDirectory: ambiguous.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-canonical-owner-progress',
    });
    handleProgressAwareStop({
      runDirectory: ambiguous.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      resumeToken: 'continuation-canonical-owner-strike-1',
    });
    const stuck = handleProgressAwareStop({
      runDirectory: ambiguous.runDirectory,
      env: enabledEnv,
      timestamp: now(),
      missingOwnerDecisionId: decisionA.id,
    });
    const repeated = handleProgressAwareStop({
      runDirectory: ambiguous.runDirectory,
      env: enabledEnv,
      timestamp: now(),
    });
    assert.equal(stuck.status, 'stuck');
    assert.deepEqual(stuck.blocker.missingOwnerDecision, decisionA);
    assert.equal(repeated.status, 'stuck');
    assert.deepEqual(repeated.blocker.missingOwnerDecision, decisionA);
    assert.notDeepEqual(repeated.blocker.missingOwnerDecision, decisionB);
  });

  await check('the continuation layer is additive, default-off, and wired immediately after run-doctor', () => {
    const defaultSurfaces = [
      'install.mjs',
      'install.sh',
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
    // Installers may name the flag/module only to prune it from the default copy.
    // Reject actual imports, calls, or CLI launches instead of that removal-list literal.
    const forbidden = /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*continuation\.mjs|handleProgressAwareStop\s*\(|node[^\n]*continuation\.mjs/;
    for (const file of defaultSurfaces.flatMap(recursiveFiles)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        forbidden,
        path.relative(REPO, file),
      );
    }

    const packageJson = JSON.parse(readFileSync(
      path.join(REPO, 'package.json'),
      'utf8',
    ));
    assert.deepEqual(packageJson.dependencies, {});
    // This test's own placement is its claim: continuation runs immediately after run-doctor. Do NOT pin the
    // whole downstream sequence — later goals legitimately insert tests further down the chain.
    assert.match(
      packageJson.scripts.test,
      /node test\/run-doctor-test\.mjs && node test\/continuation-test\.mjs/,
    );
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
