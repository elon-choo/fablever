#!/usr/bin/env node
// G5.2 UNIT: planned/done/verified + verification debt in one run-ledger authority.
import assert from 'node:assert/strict';
import {
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
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  RUN_WRITE_BOUNDARIES,
  addVerificationDebt,
  appendRunEvent,
  completeCriterion,
  createEvidenceReceipt,
  createRun,
  loadRunState,
  markCriterionDone,
  readRunLedger,
  recordCriterionEvidence,
  replayRunLedger,
  resolveVerificationDebt,
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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = second => `2026-07-17T06:00:${String(second).padStart(2, '0')}.000Z`;
const contract = Object.freeze({
  schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
  runId: 'g5.2-state-debt-fixture',
  goal: 'Keep goal status and verification debt in the existing run ledger.',
  criteria: Object.freeze([
    Object.freeze({
      id: 'criterion.planned',
      description: 'A declared goal remains planned.',
    }),
    Object.freeze({
      id: 'criterion.done',
      description: 'Work is done but not yet verified.',
    }),
    Object.freeze({
      id: 'criterion.verified',
      description: 'Current PASS evidence verifies the goal.',
    }),
  ]),
  scope: Object.freeze({
    include: Object.freeze([
      'orchestration/lib/run-state.mjs',
      'test/state-debt-test.mjs',
      'package.json',
    ]),
    exclude: Object.freeze([
      'docs/proposals/HARNESS-UPGRADE-LEDGER.md',
      '.fablever_state',
      'G5.2 Opus A/B',
    ]),
  }),
  allowedActions: Object.freeze([
    'append typed events to ledger.jsonl at explicit natural boundaries',
    'read contract.json and ledger.jsonl',
    'run local deterministic checks',
  ]),
  blockers: Object.freeze([]),
  checks: Object.freeze([
    Object.freeze({
      id: 'check.planned',
      criterionId: 'criterion.planned',
      type: 'assertion',
      definition: 'criterion remains planned without a done boundary',
    }),
    Object.freeze({
      id: 'check.done',
      criterionId: 'criterion.done',
      type: 'assertion',
      definition: 'criterion.done records work completion without verification',
    }),
    Object.freeze({
      id: 'check.verified',
      criterionId: 'criterion.verified',
      type: 'command',
      definition: 'node test/state-debt-test.mjs',
    }),
  ]),
});

function listTree(directory, relative = '') {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      entries.push(`${childRelative}/`);
      entries.push(...listTree(child, childRelative));
    } else if (entry.isFile()) {
      entries.push(childRelative);
    }
  }
  return entries.sort();
}

function ledgerText(runDirectory) {
  return readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8');
}

function prepareRun(root, name) {
  const runDirectory = path.join(root, name);
  mkdirSync(path.join(runDirectory, 'targets'), { recursive: true });
  mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
  for (const criterion of contract.criteria) {
    writeFileSync(
      path.join(runDirectory, 'targets', `${criterion.id}.txt`),
      `target:${criterion.id}\n`,
    );
  }
  writeFileSync(
    path.join(runDirectory, 'artifacts', 'receipt.verified.txt'),
    'artifact:receipt.verified\n',
  );
  createRun(runDirectory, contract, { timestamp: at(0) });
  return runDirectory;
}

function verifiedReceipt(runDirectory, attemptId) {
  const definition = contract.checks.find(
    entry => entry.criterionId === 'criterion.verified',
  );
  return createEvidenceReceipt(runDirectory, {
    id: 'receipt.verified',
    criterionId: 'criterion.verified',
    attemptId,
    check: {
      id: definition.id,
      type: definition.type,
      definition: definition.definition,
    },
    result: 'pass',
    recordedAt: at(5),
    targetRoot: runDirectory,
    targetPaths: ['targets/criterion.verified.txt'],
    artifactPath: 'artifacts/receipt.verified.txt',
  });
}

function exerciseExtendedState(runDirectory) {
  startCriterionAttempt(
    runDirectory,
    'criterion.done',
    'attempt.done.1',
    { timestamp: at(1) },
  );
  markCriterionDone(
    runDirectory,
    'criterion.done',
    {
      boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
      timestamp: at(2),
    },
  );

  startCriterionAttempt(
    runDirectory,
    'criterion.verified',
    'attempt.verified.1',
    { timestamp: at(3) },
  );
  markCriterionDone(
    runDirectory,
    'criterion.verified',
    {
      boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
      timestamp: at(4),
    },
  );
  const receipt = verifiedReceipt(runDirectory, 'attempt.verified.1');
  recordCriterionEvidence(runDirectory, receipt, { timestamp: at(5) });
  completeCriterion(
    runDirectory,
    'criterion.verified',
    receipt.id,
    { timestamp: at(6) },
  );

  addVerificationDebt(
    runDirectory,
    {
      debtId: 'debt.resolved',
      criterionId: 'criterion.done',
      description: 'A seeded verification gap that is then resolved.',
    },
    {
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      timestamp: at(7),
    },
  );
  resolveVerificationDebt(
    runDirectory,
    'debt.resolved',
    {
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      timestamp: at(8),
    },
  );
  addVerificationDebt(
    runDirectory,
    {
      debtId: 'debt.open',
      criterionId: 'criterion.done',
      description: 'Current verification is still owed for completed work.',
    },
    {
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      timestamp: at(9),
    },
  );
}

function collectTextFiles(entryPath) {
  if (!existsSync(entryPath)) return [];
  const entries = readdirSync(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(entryPath, entry.name);
    if (entry.isDirectory()) files.push(...collectTextFiles(child));
    else if (entry.isFile() && /\.(?:c?js|mjs|md|sh|json)$/.test(entry.name)) files.push(child);
  }
  return files;
}

console.log('verification debt + goal/evidence single authority (G5.2 unit):');

const root = mkdtempSync(path.join(tmpdir(), 'fable-state-debt-'));
try {
  check('schema round-trip losslessly reconstructs planned/done/verified plus debt', () => {
    const runDirectory = prepareRun(root, 'round-trip');
    exerciseExtendedState(runDirectory);

    const events = readRunLedger(runDirectory);
    const direct = replayRunLedger(events);
    const serialized = replayRunLedger(JSON.parse(JSON.stringify(events)));
    const legacyEvents = JSON.parse(JSON.stringify(events));
    for (const event of legacyEvents) {
      if (event.type === RUN_EVENT_TYPES.DEBT_ADDED
        || event.type === RUN_EVENT_TYPES.DEBT_RESOLVED) {
        delete event.payload.boundary;
      }
    }
    const legacyReplay = replayRunLedger(legacyEvents);
    const loaded = loadRunState(runDirectory);
    const expectedStatuses = Object.freeze({
      planned: ['criterion.planned'],
      done: ['criterion.done'],
      verified: ['criterion.verified'],
    });

    assert.deepEqual(direct.goalStatus, expectedStatuses);
    assert.deepEqual(serialized.goalStatus, direct.goalStatus);
    assert.deepEqual(loaded.goalStatus, direct.goalStatus);
    assert.deepEqual(
      direct.criteria.map(({ id, goalStatus }) => ({ id, goalStatus })),
      [
        { id: 'criterion.planned', goalStatus: 'planned' },
        { id: 'criterion.done', goalStatus: 'done' },
        { id: 'criterion.verified', goalStatus: 'verified' },
      ],
    );
    assert.deepEqual(serialized.debt, direct.debt);
    assert.deepEqual(loaded.debt, direct.debt);
    assert.deepEqual(legacyReplay.debt.open.map(entry => entry.id), ['debt.open']);
    assert.deepEqual(legacyReplay.debt.resolved.map(entry => entry.id), ['debt.resolved']);
    assert.deepEqual(direct.debt.open.map(entry => entry.id), ['debt.open']);
    assert.deepEqual(direct.debt.resolved.map(entry => entry.id), ['debt.resolved']);
    assert.equal(
      direct.debt.open[0].addedBoundary,
      RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    );
    assert.equal(
      direct.debt.resolved[0].resolvedBoundary,
      RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    );
    assert.equal(
      events.filter(event => event.type === RUN_EVENT_TYPES.CRITERION_DONE).length,
      2,
    );
  });

  check('invalid done transitions and malformed events append no ledger bytes', () => {
    const runDirectory = prepareRun(root, 'strict-transitions');
    const beforeNoAttempt = ledgerText(runDirectory);
    assert.throws(
      () => markCriterionDone(
        runDirectory,
        'criterion.done',
        { boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION },
      ),
      /current attempt/,
    );
    assert.equal(ledgerText(runDirectory), beforeNoAttempt);

    startCriterionAttempt(
      runDirectory,
      'criterion.done',
      'attempt.strict.1',
      { timestamp: at(1) },
    );
    markCriterionDone(
      runDirectory,
      'criterion.done',
      {
        boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
        timestamp: at(2),
      },
    );
    const beforeDuplicate = ledgerText(runDirectory);
    assert.throws(
      () => markCriterionDone(
        runDirectory,
        'criterion.done',
        { boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION },
      ),
      /requires planned goal status/,
    );
    assert.equal(ledgerText(runDirectory), beforeDuplicate);
    assert.throws(
      () => appendRunEvent(
        runDirectory,
        RUN_EVENT_TYPES.CRITERION_DONE,
        {
          criterionId: 'criterion.planned',
          boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
          forged: true,
        },
      ),
      /unknown field/,
    );
    assert.equal(ledgerText(runDirectory), beforeDuplicate);
  });

  check('status and verification-debt writes are explicit natural boundaries, never turns', () => {
    const runDirectory = prepareRun(root, 'boundary-gate');
    startCriterionAttempt(
      runDirectory,
      'criterion.done',
      'attempt.boundary.1',
      { timestamp: at(1) },
    );
    const before = ledgerText(runDirectory);
    for (const [type, payload] of [
      [
        RUN_EVENT_TYPES.DEBT_ADDED,
        {
          debtId: 'debt.raw-unbounded',
          criterionId: 'criterion.done',
          description: 'A raw live debt write without a boundary.',
        },
      ],
      [
        RUN_EVENT_TYPES.DEBT_RESOLVED,
        { debtId: 'debt.raw-unbounded' },
      ],
    ]) {
      assert.throws(
        () => appendRunEvent(runDirectory, type, payload),
        /live debt\.(?:added|resolved) writes require boundary/,
      );
      assert.equal(ledgerText(runDirectory), before);
    }
    for (const options of [
      {},
      { boundary: 'turn' },
      { boundary: 'per-turn' },
      { boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION },
    ]) {
      assert.throws(
        () => markCriterionDone(runDirectory, 'criterion.done', options),
        /boundary|per-turn/,
      );
      assert.equal(ledgerText(runDirectory), before);
    }

    const beforeDoneCount = readRunLedger(runDirectory).length;
    markCriterionDone(
      runDirectory,
      'criterion.done',
      { boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION },
    );
    assert.equal(readRunLedger(runDirectory).length, beforeDoneCount + 1);

    const debtInput = {
      debtId: 'debt.boundary',
      criterionId: 'criterion.done',
      description: 'Boundary-gated verification debt.',
    };
    const beforeDebt = ledgerText(runDirectory);
    for (const options of [
      {},
      { boundary: 'turn' },
      { boundary: 'per-turn' },
      { boundary: RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION },
    ]) {
      assert.throws(
        () => addVerificationDebt(runDirectory, debtInput, options),
        /boundary|per-turn/,
      );
      assert.equal(ledgerText(runDirectory), beforeDebt);
    }
    addVerificationDebt(
      runDirectory,
      debtInput,
      { boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION },
    );
    const beforeResolve = ledgerText(runDirectory);
    assert.throws(
      () => appendRunEvent(
        runDirectory,
        RUN_EVENT_TYPES.DEBT_RESOLVED,
        { debtId: debtInput.debtId },
      ),
      /live debt\.resolved writes require boundary/,
    );
    assert.equal(ledgerText(runDirectory), beforeResolve);
    assert.throws(
      () => resolveVerificationDebt(runDirectory, debtInput.debtId, {}),
      /boundary/,
    );
    assert.equal(ledgerText(runDirectory), beforeResolve);
    resolveVerificationDebt(
      runDirectory,
      debtInput.debtId,
      { boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION },
    );

    const beforeTurns = ledgerText(runDirectory);
    for (let turn = 0; turn < 5; turn++) loadRunState(runDirectory);
    assert.equal(ledgerText(runDirectory), beforeTurns);
    assert.equal(
      Object.values(RUN_WRITE_BOUNDARIES).some(value => /\bturn\b/i.test(value)),
      false,
    );
    assert.equal(
      Object.keys(RUN_EVENT_TYPES).some(value => /\bTURN\b/.test(value)),
      false,
    );
  });

  check('N7 hard assertion: debt/status operations create zero new state files', () => {
    const runDirectory = prepareRun(root, 'n7-files');
    const before = listTree(runDirectory);
    exerciseExtendedState(runDirectory);
    const after = listTree(runDirectory);

    assert.deepEqual(after, before);
    assert.deepEqual(
      after.filter(entry => !entry.endsWith('/') && /\.(?:json|jsonl)$/.test(entry)),
      [RUN_FILES.contract, RUN_FILES.ledger].sort(),
    );
    assert.equal(after.some(entry => entry.includes('.fablever_state')), false);
    assert.equal(existsSync(path.join(runDirectory, RUN_FILES.cache)), false);
    assert.equal(
      after.some(entry => /(?:goal|debt|status).*\.(?:json|jsonl)$/i.test(entry)),
      false,
    );
  });

  check('built-in grep finds no shipped per-turn/default writer path', () => {
    const surfaces = [
      'claude-code/hooks',
      'codex/hooks',
      'profiles',
      'mcp',
      'fusion',
    ].flatMap(relative => collectTextFiles(path.join(projectRoot, relative)));
    surfaces.push(
      path.join(projectRoot, 'install.mjs'),
      path.join(projectRoot, 'install.sh'),
    );
    const needles = [
      'markCriterionDone',
      'addVerificationDebt',
      'resolveVerificationDebt',
      'criterion.done',
    ];
    const matches = [];
    for (const file of surfaces) {
      const source = readFileSync(file, 'utf8');
      for (const needle of needles) {
        if (source.includes(needle)) {
          matches.push(`${path.relative(projectRoot, file)}:${needle}`);
        }
      }
    }
    assert.deepEqual(matches, []);

    const runStateSource = readFileSync(
      path.join(projectRoot, 'orchestration/lib/run-state.mjs'),
      'utf8',
    );
    assert.match(runStateSource, /per-turn writes are forbidden/);
    assert.doesNotMatch(runStateSource, /RUN_WRITE_BOUNDARIES[\s\S]*?\bTURN\s*:/);
  });

  check('package test chain places state-debt immediately after tier routing', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    );
    const chain = packageJson.scripts.test.split(' && ');
    const tierIndex = chain.indexOf('node test/tier-routing-test.mjs');
    assert.notEqual(tierIndex, -1);
    assert.equal(chain[tierIndex + 1], 'node test/state-debt-test.mjs');
    assert.equal(
      chain.filter(entry => entry === 'node test/state-debt-test.mjs').length,
      1,
    );
    assert.deepEqual(packageJson.dependencies, {});
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
