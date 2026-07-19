#!/usr/bin/env node
// G3.2 bidirectional oracle for criterion-bound receipts and scoped freshness.
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  appendRunEvent,
  completeCriterion,
  computeTargetIdentity,
  createEvidenceReceipt,
  createRun,
  loadRunState,
  readRunLedger,
  recordCriterionEvidence,
  startCriterionAttempt,
} from '../orchestration/lib/run-state.mjs';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name + ' — ' + error.message);
  }
}

const at = second => `2026-07-17T00:00:${String(second).padStart(2, '0')}.000Z`;
const contract = Object.freeze({
  schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
  runId: 'g3.2-fixture',
  goal: 'Bind criterion completion to fresh executable evidence.',
  criteria: Object.freeze([
    Object.freeze({
      id: 'criterion.x',
      description: 'Target X is verified.',
    }),
    Object.freeze({
      id: 'criterion.y',
      description: 'Target Y is verified independently.',
    }),
  ]),
  scope: Object.freeze({
    include: Object.freeze([
      'orchestration/lib/run-state.mjs',
      'test/evidence-receipt-test.mjs',
    ]),
    exclude: Object.freeze(['default install/runtime paths']),
  }),
  allowedActions: Object.freeze([
    'append typed run-ledger events',
    'hash declared target paths',
    'read local verification artifacts',
  ]),
  blockers: Object.freeze([]),
  checks: Object.freeze([
    Object.freeze({
      id: 'check.x',
      criterionId: 'criterion.x',
      type: 'command',
      definition: 'node check-x.mjs',
    }),
    Object.freeze({
      id: 'check.y',
      criterionId: 'criterion.y',
      type: 'assertion',
      definition: 'target Y remains byte-identical',
    }),
  ]),
});

function createFixtureRun(root, name) {
  const runDirectory = path.join(root, name);
  createRun(runDirectory, contract, { timestamp: at(0) });
  return runDirectory;
}

function checkSnapshot(criterionId) {
  const definition = contract.checks.find(entry => entry.criterionId === criterionId);
  return {
    id: definition.id,
    type: definition.type,
    definition: definition.definition,
  };
}

function buildReceipt(runDirectory, {
  id,
  criterionId,
  attemptId,
  result = 'pass',
  recordedAt = at(2),
  targetPath = `targets/${criterionId}.txt`,
  targetContent = `target:${criterionId}\n`,
  artifactContent = `artifact:${id}\n`,
} = {}) {
  const targetFile = path.join(runDirectory, targetPath);
  const artifactPath = `artifacts/${id}.txt`;
  mkdirSync(path.dirname(targetFile), { recursive: true });
  mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
  writeFileSync(targetFile, targetContent);
  writeFileSync(path.join(runDirectory, artifactPath), artifactContent);
  return createEvidenceReceipt(runDirectory, {
    id,
    criterionId,
    attemptId,
    check: checkSnapshot(criterionId),
    result,
    recordedAt,
    targetRoot: runDirectory,
    targetPaths: [targetPath],
    artifactPath,
  });
}

function ledgerText(runDirectory) {
  return readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8');
}

function assertCriterionOpen(runDirectory, criterionId) {
  const state = loadRunState(runDirectory);
  assert.equal(
    state.criteria.find(entry => entry.id === criterionId).status,
    'open',
  );
}

console.log('criterion-bound evidence receipts + freshness invalidation (G3.2):');

const root = mkdtempSync(path.join(tmpdir(), 'fable-evidence-receipt-'));
try {
  // (a) Every named invalid receipt case blocks completion; a valid receipt passes.
  check('missing receipt blocks completion and appends no ledger bytes', () => {
    const runDirectory = createFixtureRun(root, 'missing');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.missing.1',
      { timestamp: at(1) },
    );
    const before = ledgerText(runDirectory);
    assert.throws(
      () => appendRunEvent(
        runDirectory,
        RUN_EVENT_TYPES.CRITERION_COMPLETED,
        { criterionId: 'criterion.x' },
        { timestamp: at(2) },
      ),
      /receiptId/,
    );
    assert.equal(ledgerText(runDirectory), before);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('empty receipt blocks recording and therefore cannot complete', () => {
    const runDirectory = createFixtureRun(root, 'empty');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.empty.1',
      { timestamp: at(1) },
    );
    const before = ledgerText(runDirectory);
    assert.throws(
      () => recordCriterionEvidence(runDirectory, {}, { timestamp: at(2) }),
      /missing required field/,
    );
    assert.throws(
      () => completeCriterion(
        runDirectory,
        'criterion.x',
        'receipt.empty',
        { timestamp: at(3) },
      ),
      /missing evidence receipt/,
    );
    assert.equal(ledgerText(runDirectory), before);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('unreadable or malformed receipt source blocks completion', () => {
    const runDirectory = createFixtureRun(root, 'unreadable-malformed');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.unreadable.1',
      { timestamp: at(1) },
    );
    const before = ledgerText(runDirectory);
    assert.throws(
      () => recordCriterionEvidence(
        runDirectory,
        path.join(runDirectory, 'missing-receipt.json'),
        { timestamp: at(2) },
      ),
      /unreadable/,
    );
    const malformedPath = path.join(runDirectory, 'malformed-receipt.json');
    writeFileSync(malformedPath, '{"schemaVersion":1');
    assert.throws(
      () => recordCriterionEvidence(
        runDirectory,
        malformedPath,
        { timestamp: at(2) },
      ),
      /not complete valid JSON/,
    );
    assert.throws(
      () => completeCriterion(
        runDirectory,
        'criterion.x',
        'receipt.unreadable',
        { timestamp: at(3) },
      ),
      /missing evidence receipt/,
    );
    assert.equal(ledgerText(runDirectory), before);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('failure-result receipt is recordable but blocks completion', () => {
    const runDirectory = createFixtureRun(root, 'failed-result');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.failed.1',
      { timestamp: at(1) },
    );
    const receipt = buildReceipt(runDirectory, {
      id: 'receipt.failed',
      criterionId: 'criterion.x',
      attemptId: 'attempt.failed.1',
      result: 'fail',
    });
    recordCriterionEvidence(runDirectory, receipt, { timestamp: at(2) });
    const beforeCompletion = ledgerText(runDirectory);
    assert.throws(
      () => completeCriterion(
        runDirectory,
        'criterion.x',
        receipt.id,
        { timestamp: at(3) },
      ),
      /recorded failure/,
    );
    assert.equal(ledgerText(runDirectory), beforeCompletion);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('receipt bound to the wrong criterion blocks completion', () => {
    const runDirectory = createFixtureRun(root, 'wrong-criterion');
    startCriterionAttempt(
      runDirectory,
      'criterion.y',
      'attempt.wrong.y',
      { timestamp: at(1) },
    );
    const receipt = buildReceipt(runDirectory, {
      id: 'receipt.y',
      criterionId: 'criterion.y',
      attemptId: 'attempt.wrong.y',
    });
    recordCriterionEvidence(runDirectory, receipt, { timestamp: at(2) });
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.wrong.x',
      { timestamp: at(3) },
    );
    const beforeCompletion = ledgerText(runDirectory);
    assert.throws(
      () => completeCriterion(
        runDirectory,
        'criterion.x',
        receipt.id,
        { timestamp: at(4) },
      ),
      /belongs to criterion "criterion\.y"/,
    );
    assert.equal(ledgerText(runDirectory), beforeCompletion);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('receipt from an older attempt blocks completion', () => {
    const runDirectory = createFixtureRun(root, 'stale-attempt');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.stale.1',
      { timestamp: at(1) },
    );
    const receipt = buildReceipt(runDirectory, {
      id: 'receipt.stale',
      criterionId: 'criterion.x',
      attemptId: 'attempt.stale.1',
    });
    recordCriterionEvidence(runDirectory, receipt, { timestamp: at(2) });
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.stale.2',
      { timestamp: at(3) },
    );
    const beforeCompletion = ledgerText(runDirectory);
    assert.throws(
      () => completeCriterion(
        runDirectory,
        'criterion.x',
        receipt.id,
        { timestamp: at(4) },
      ),
      /stale attempt/,
    );
    assert.equal(ledgerText(runDirectory), beforeCompletion);
    assertCriterionOpen(runDirectory, 'criterion.x');
  });

  check('valid current-attempt PASS receipt completes bidirectionally', () => {
    const runDirectory = createFixtureRun(root, 'valid');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.valid.1',
      { timestamp: at(1) },
    );
    const receipt = buildReceipt(runDirectory, {
      id: 'receipt.valid',
      criterionId: 'criterion.x',
      attemptId: 'attempt.valid.1',
    });
    recordCriterionEvidence(runDirectory, receipt, { timestamp: at(2) });
    completeCriterion(
      runDirectory,
      'criterion.x',
      receipt.id,
      { timestamp: at(3) },
    );

    const state = loadRunState(runDirectory);
    const criterion = state.criteria.find(entry => entry.id === 'criterion.x');
    assert.equal(criterion.status, 'complete');
    assert.equal(criterion.completionReceiptId, receipt.id);
    assert.equal(criterion.freshness, 'fresh');
    assert.deepEqual(state.completeCriteria, ['criterion.x']);

    const events = readRunLedger(runDirectory);
    const evidenceEvent = events.find(
      event => event.type === RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    );
    const completionEvent = events.find(
      event => event.type === RUN_EVENT_TYPES.CRITERION_COMPLETED,
    );
    assert.deepEqual(evidenceEvent.payload.receipt, receipt);
    assert.equal(completionEvent.payload.receiptId, receipt.id);
  });

  // (b, c) Freshness is scoped to exactly each receipt's declared target paths.
  // A file target observes only that file; a directory observes its descendants.
  // Changes outside that declared dependency closure do not invalidate the receipt.
  check('target X change reopens X while unrelated target Y stays complete', () => {
    const runDirectory = createFixtureRun(root, 'freshness');
    startCriterionAttempt(
      runDirectory,
      'criterion.x',
      'attempt.fresh.x',
      { timestamp: at(1) },
    );
    const receiptX = buildReceipt(runDirectory, {
      id: 'receipt.fresh.x',
      criterionId: 'criterion.x',
      attemptId: 'attempt.fresh.x',
      targetPath: 'targets/x.txt',
      targetContent: 'x:v1\n',
    });
    recordCriterionEvidence(runDirectory, receiptX, { timestamp: at(2) });
    completeCriterion(
      runDirectory,
      'criterion.x',
      receiptX.id,
      { timestamp: at(3) },
    );

    startCriterionAttempt(
      runDirectory,
      'criterion.y',
      'attempt.fresh.y',
      { timestamp: at(4) },
    );
    const receiptY = buildReceipt(runDirectory, {
      id: 'receipt.fresh.y',
      criterionId: 'criterion.y',
      attemptId: 'attempt.fresh.y',
      targetPath: 'targets/y.txt',
      targetContent: 'y:v1\n',
    });
    recordCriterionEvidence(runDirectory, receiptY, { timestamp: at(5) });
    completeCriterion(
      runDirectory,
      'criterion.y',
      receiptY.id,
      { timestamp: at(6) },
    );

    assert.deepEqual(loadRunState(runDirectory).completeCriteria, [
      'criterion.x',
      'criterion.y',
    ]);
    writeFileSync(path.join(runDirectory, 'targets/x.txt'), 'x:v2\n');

    const currentX = computeTargetIdentity(runDirectory, ['targets/x.txt']);
    const currentY = computeTargetIdentity(runDirectory, ['targets/y.txt']);
    assert.notEqual(currentX.treeHash, receiptX.target.treeHash);
    assert.equal(currentY.treeHash, receiptY.target.treeHash);

    const state = loadRunState(runDirectory);
    const criterionX = state.criteria.find(entry => entry.id === 'criterion.x');
    const criterionY = state.criteria.find(entry => entry.id === 'criterion.y');
    assert.equal(criterionX.status, 'open');
    assert.equal(criterionX.freshness, 'stale');
    assert.equal(criterionX.staleReason, 'target_hash_mismatch');
    assert.equal(criterionY.status, 'complete');
    assert.equal(criterionY.freshness, 'fresh');
    assert.deepEqual(state.openCriteria, ['criterion.x']);
    assert.deepEqual(state.completeCriteria, ['criterion.y']);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
