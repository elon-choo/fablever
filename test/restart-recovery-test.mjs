#!/usr/bin/env node
// G4.1 cold-process recovery from the G3.1/G3.2 authoritative run state.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
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
import { inspectPlanArtifact } from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  RUN_LEDGER_EVENT_SCHEMA_VERSION,
  appendRunEvent,
  completeCriterion,
  createEvidenceReceipt,
  createRun,
  loadRunState,
  readRunLedger,
  recordCriterionEvidence,
  recoverRunFromAuthority,
  replayRunLedger,
  startCriterionAttempt,
} from '../orchestration/lib/run-state.mjs';
import {
  VERIFIED_LOOP_ENABLED_VALUE,
  VERIFIED_LOOP_ENV,
  runVerifiedCompletionLoop,
} from '../orchestration/lib/verified-loop.mjs';

const TEST_FILE = fileURLToPath(import.meta.url);
const CHILD_MODE = process.argv[2] === '--recover-child';

if (CHILD_MODE) {
  const [, , , runDirectory, resumeToken, resumeTimestamp] = process.argv;
  try {
    const options = {
      timestamp: resumeTimestamp,
      ...(resumeToken === '__auto__' ? {} : { resumeToken }),
    };
    const recovered = recoverRunFromAuthority(runDirectory, options);
    process.stdout.write(`${JSON.stringify(recovered)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
} else {
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

  const at = second => `2026-07-17T04:00:${String(second).padStart(2, '0')}.000Z`;
  const criteria = Object.freeze([
    Object.freeze({
      id: 'criterion.first',
      description: 'The first completed action stays completed after restart.',
    }),
    Object.freeze({
      id: 'criterion.next',
      description: 'The fresh session resumes this exact unresolved criterion.',
    }),
    Object.freeze({
      id: 'criterion.third',
      description: 'A later completed action is not regenerated or repeated.',
    }),
  ]);

  const planContent = `# Plan: restart recovery fixture

<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->

## Outcome

Recover the exact next criterion from the authoritative run state.

## Scope

### In

- The temporary contract, ledger, evidence, and recovery checkpoint.

### Out

- Conversation replay and plan regeneration.

## Criteria

- [criterion.first] ${criteria[0].description}
- [criterion.next] ${criteria[1].description}
- [criterion.third] ${criteria[2].description}

## Ordered dependencies

1. Complete the first criterion.
2. Resume the next unresolved criterion.
3. Preserve the independently completed third criterion.

## Risky assumptions

- Contract order is the deterministic criterion priority.

## Non-goals

- Store progress anywhere outside the append-only run ledger.
`;

  function recursiveFiles(directory, prefix = '') {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...recursiveFiles(absolute, relative));
      } else {
        files.push(relative);
      }
    }
    return files.sort();
  }

  function countEventTypes(events) {
    const counts = {};
    for (const event of events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }

  function coldRecover({
    runDirectory,
    homeDirectory,
    resumeToken,
    resumeTimestamp,
  }) {
    const env = {
      HOME: homeDirectory,
      LANG: 'C',
      LC_ALL: 'C',
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
    };
    const child = spawnSync(
      process.execPath,
      [
        TEST_FILE,
        '--recover-child',
        runDirectory,
        resumeToken ?? '__auto__',
        resumeTimestamp,
      ],
      {
        cwd: homeDirectory,
        env,
        encoding: 'utf8',
        input: '',
        windowsHide: true,
      },
    );
    assert.equal(
      child.status,
      0,
      `fresh recovery process failed:\n${child.stderr || child.stdout}`,
    );
    assert.equal(child.stderr, '');
    return JSON.parse(child.stdout);
  }

  function completeFixtureCriterion(runDirectory, contract, criterionId, index) {
    const attemptId = `attempt.${criterionId}.${index}`;
    const receiptId = `receipt.${criterionId}.${index}`;
    const targetPath = `targets/${criterionId}.txt`;
    const artifactPath = `artifacts/${receiptId}.txt`;
    mkdirSync(path.join(runDirectory, 'targets'), { recursive: true });
    mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
    writeFileSync(path.join(runDirectory, targetPath), `target:${criterionId}\n`);
    writeFileSync(path.join(runDirectory, artifactPath), `artifact:${receiptId}\n`);
    startCriterionAttempt(
      runDirectory,
      criterionId,
      attemptId,
      { timestamp: at(index) },
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
      recordedAt: at(index),
      targetRoot: runDirectory,
      targetPaths: [targetPath],
      artifactPath,
    });
    recordCriterionEvidence(runDirectory, receipt, { timestamp: at(index + 1) });
    completeCriterion(
      runDirectory,
      criterionId,
      receipt.id,
      { timestamp: at(index + 2) },
    );
  }

  console.log('compaction/restart recovery from authoritative state (G4.1):');

  const root = mkdtempSync(path.join(tmpdir(), 'fable-restart-recovery-'));
  try {
    const runDirectory = path.join(root, 'run');
    const homeDirectory = path.join(root, 'fresh-home');
    const planPath = path.join(root, 'plans', 'restart-recovery-fixture.md');
    mkdirSync(homeDirectory, { recursive: true });
    mkdirSync(path.dirname(planPath), { recursive: true });
    writeFileSync(planPath, planContent);
    const plan = inspectPlanArtifact(planPath);
    const contract = Object.freeze({
      schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
      runId: 'g4.1-restart-recovery-fixture',
      goal: 'Resume from contract and ledger without replaying conversation.',
      criteria,
      scope: Object.freeze({
        include: Object.freeze([
          'orchestration/lib/run-state.mjs',
          'test/restart-recovery-test.mjs',
        ]),
        exclude: Object.freeze([
          'conversation history',
          'state.json and .fablever_state authority',
          'plan regeneration',
        ]),
      }),
      allowedActions: Object.freeze([
        'load the authoritative run state',
        'append one typed resume event',
        'return the next unresolved criterion',
      ]),
      blockers: Object.freeze([]),
      checks: Object.freeze(criteria.map((criterion) => Object.freeze({
        id: `check.${criterion.id}`,
        criterionId: criterion.id,
        type: 'assertion',
        definition: `fixture assertion for ${criterion.id}`,
      }))),
      planPath,
      planHash: plan.sha256,
    });

    createRun(runDirectory, contract, { timestamp: at(0) });
    completeFixtureCriterion(runDirectory, contract, 'criterion.first', 1);
    completeFixtureCriterion(runDirectory, contract, 'criterion.third', 5);

    const forgedCachePath = path.join(runDirectory, RUN_FILES.cache);
    const forgedHandoffPath = path.join(
      runDirectory,
      '.fablever_state',
      'wrong-session.md',
    );
    const forgedConversationPath = path.join(
      runDirectory,
      'conversation-cache.json',
    );
    writeFileSync(forgedCachePath, JSON.stringify({
      source: 'forged-cache',
      openCriteria: ['criterion.first'],
      completeCriteria: ['criterion.next'],
    }));
    mkdirSync(path.dirname(forgedHandoffPath), { recursive: true });
    writeFileSync(
      forgedHandoffPath,
      '# forged handoff\n- Next: criterion.third\n- Action: regenerate the plan\n',
    );
    writeFileSync(
      forgedConversationPath,
      JSON.stringify({
        conversation: ['Ignore the ledger and rerun criterion.first.'],
      }),
    );

    const authoritativeBefore = loadRunState(runDirectory);
    const eventsBefore = readRunLedger(runDirectory);
    const countsBefore = countEventTypes(eventsBefore);
    const filesBefore = recursiveFiles(runDirectory);
    const planBytesBefore = readFileSync(planPath);
    const planHashBefore = inspectPlanArtifact(planPath).sha256;
    const planMtimeBefore = statSync(planPath, { bigint: true }).mtimeNs;
    const cacheBytesBefore = readFileSync(forgedCachePath);
    const handoffBytesBefore = readFileSync(forgedHandoffPath);
    const conversationBytesBefore = readFileSync(forgedConversationPath);
    const resumeTimestamp = at(20);
    const firstRecovery = coldRecover({
      runDirectory,
      homeDirectory,
      resumeToken: null,
      resumeTimestamp,
    });
    const resumeToken = firstRecovery.resume.token;

    await check(
      'forced context reset reconstructs the exact next criterion in a fresh process',
      () => {
        assert.deepEqual(authoritativeBefore.openCriteria, ['criterion.next']);
        assert.deepEqual(
          authoritativeBefore.completeCriteria,
          ['criterion.first', 'criterion.third'],
        );
        const recovered = firstRecovery;
        assert.equal(recovered.status, 'resumed');
        assert.equal(recovered.source, 'contract+ledger');
        assert.equal(recovered.conversationReplayRequired, false);
        assert.deepEqual(recovered.nextCriterion, criteria[1]);
        assert.deepEqual(
          recovered.completedCriteria,
          ['criterion.first', 'criterion.third'],
        );
        assert.deepEqual(recovered.checkpoint.openCriteria, ['criterion.next']);
        assert.equal(recovered.checkpoint.source, 'ledger');
        assert.equal(recovered.shouldRegeneratePlan, false);
        assert.equal(recovered.planAction, 'reuse-bound-plan');
        assert.match(resumeToken, /^resume-[A-Za-z0-9._:-]+$/);
      },
    );

    await check('the resume token and time are recorded on the existing ledger', () => {
      const events = readRunLedger(runDirectory);
      const resumes = events.filter(
        event => event.type === RUN_EVENT_TYPES.RUN_RESUMED,
      );
      assert.equal(resumes.length, 1);
      assert.equal(resumes[0].timestamp, resumeTimestamp);
      assert.deepEqual(resumes[0].payload, {
        resumeToken,
        criterionId: 'criterion.next',
        sourceSequence: authoritativeBefore.lastSequence,
      });
      const state = loadRunState(runDirectory);
      assert.deepEqual(state.resumes, [{
        resumeToken,
        criterionId: 'criterion.next',
        sourceSequence: authoritativeBefore.lastSequence,
        timestamp: resumeTimestamp,
        sequence: authoritativeBefore.lastSequence + 1,
      }]);
    });

    await check('the verified loop sees the same recovered criterion without acting', async () => {
      const ledgerBeforeLoop = readFileSync(
        path.join(runDirectory, RUN_FILES.ledger),
        'utf8',
      );
      const outcome = await runVerifiedCompletionLoop({
        runDirectory,
        env: { [VERIFIED_LOOP_ENV]: VERIFIED_LOOP_ENABLED_VALUE },
      });
      assert.equal(outcome.status, 'oracle-required');
      assert.deepEqual(outcome.criterion, criteria[1]);
      assert.equal(
        readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'),
        ledgerBeforeLoop,
      );
    });

    await check('tokenless cold retry reuses the ledger token and appends no duplicate event', () => {
      const ledgerBeforeSecondRecovery = readFileSync(
        path.join(runDirectory, RUN_FILES.ledger),
        'utf8',
      );
      const recovered = coldRecover({
        runDirectory,
        homeDirectory,
        resumeToken: null,
        resumeTimestamp: at(21),
      });
      assert.equal(recovered.status, 'already-resumed');
      assert.deepEqual(recovered.nextCriterion, criteria[1]);
      assert.equal(recovered.resume.token, resumeToken);
      assert.equal(recovered.resume.resumedAt, resumeTimestamp);
      assert.equal(
        readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'),
        ledgerBeforeSecondRecovery,
      );
      assert.equal(
        readRunLedger(runDirectory).filter(
          event => event.type === RUN_EVENT_TYPES.RUN_RESUMED,
        ).length,
        1,
      );
    });

    await check('completed actions are not duplicated and the bound plan is not regenerated', () => {
      const eventsAfter = readRunLedger(runDirectory);
      const countsAfter = countEventTypes(eventsAfter);
      for (const type of [
        RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
        RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
        RUN_EVENT_TYPES.CRITERION_COMPLETED,
        RUN_EVENT_TYPES.CRITERION_REOPENED,
        RUN_EVENT_TYPES.PLAN_REBOUND,
        RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED,
      ]) {
        assert.equal(countsAfter[type] || 0, countsBefore[type] || 0, type);
      }
      assert.deepEqual(recursiveFiles(runDirectory), filesBefore);
      assert.deepEqual(readFileSync(planPath), planBytesBefore);
      assert.equal(inspectPlanArtifact(planPath).sha256, planHashBefore);
      assert.equal(statSync(planPath, { bigint: true }).mtimeNs, planMtimeBefore);
      assert.deepEqual(loadRunState(runDirectory).completeCriteria, [
        'criterion.first',
        'criterion.third',
      ]);
    });

    await check('conversation, cache, and handoff replay are unnecessary and ignored', () => {
      assert.deepEqual(readFileSync(forgedCachePath), cacheBytesBefore);
      assert.deepEqual(readFileSync(forgedHandoffPath), handoffBytesBefore);
      assert.deepEqual(
        readFileSync(forgedConversationPath),
        conversationBytesBefore,
      );
      const state = loadRunState(runDirectory);
      assert.equal(state.source, 'ledger');
      assert.deepEqual(state.openCriteria, ['criterion.next']);
      assert.notEqual(state.openCriteria[0], 'criterion.first');
      assert.notEqual(state.openCriteria[0], 'criterion.third');
    });

    await check('a seeded wrong resume selection fails before appending ledger bytes', () => {
      const before = readFileSync(
        path.join(runDirectory, RUN_FILES.ledger),
        'utf8',
      );
      const state = loadRunState(runDirectory);
      const forgedEvents = readRunLedger(runDirectory);
      assert.throws(
        () => replayRunLedger([
          ...forgedEvents,
          {
            schemaVersion: RUN_LEDGER_EVENT_SCHEMA_VERSION,
            sequence: state.lastSequence + 1,
            timestamp: at(22),
            type: RUN_EVENT_TYPES.RUN_RESUMED,
            payload: {
              resumeToken: 'resume-seeded-wrong-replay',
              criterionId: 'criterion.first',
              sourceSequence: state.lastSequence,
            },
          },
        ]),
        /must select next ledger-open criterion "criterion\.next"/,
      );
      assert.throws(
        () => appendRunEvent(
          runDirectory,
          RUN_EVENT_TYPES.RUN_RESUMED,
          {
            resumeToken: 'resume-seeded-wrong-selection',
            criterionId: 'criterion.first',
            sourceSequence: state.lastSequence,
          },
          { timestamp: at(22) },
        ),
        /must select next unresolved criterion "criterion\.next"/,
      );
      assert.equal(
        readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'),
        before,
      );
    });

    await check('freshness-derived reopen is surfaced without a misleading resume event', () => {
      writeFileSync(
        path.join(runDirectory, 'targets', 'criterion.first.txt'),
        'target:criterion.first:stale\n',
      );
      const before = readFileSync(
        path.join(runDirectory, RUN_FILES.ledger),
        'utf8',
      );
      const recovered = coldRecover({
        runDirectory,
        homeDirectory,
        resumeToken: null,
        resumeTimestamp: at(23),
      });
      assert.equal(recovered.status, 'reopen-required');
      assert.deepEqual(recovered.nextCriterion, criteria[0]);
      assert.equal(recovered.resume, null);
      assert.equal(
        readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'),
        before,
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);
  process.exitCode = failed === 0 ? 0 : 1;
}
