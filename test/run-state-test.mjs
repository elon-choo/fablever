#!/usr/bin/env node
// G3.1 bidirectional oracle for the single writable run-state authority.
// Covers strict contract v1 validation, append-only typed events, ledger-only replay,
// forged-cache immunity, and atomic/partial contract behavior.
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  RUN_LEDGER_EVENT_SCHEMA_VERSION,
  RUN_WRITE_BOUNDARIES,
  appendRunEvent,
  computeTargetIdentity,
  createEvidenceReceipt,
  createRun,
  createRunContract,
  loadRunState,
  readRunContract,
  readRunLedger,
  recordCriterionEvidence,
  replayRunLedger,
  validateRunContract,
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

const clone = value => JSON.parse(JSON.stringify(value));
const at = second => `2026-07-16T00:00:${String(second).padStart(2, '0')}.000Z`;
const validContract = Object.freeze({
  schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
  runId: 'g3.1-fixture',
  goal: 'Keep run completion grounded in one durable authority.',
  criteria: Object.freeze([
    Object.freeze({
      id: 'criterion.schema',
      description: 'The versioned contract rejects invalid inputs.',
    }),
    Object.freeze({
      id: 'criterion.authority',
      description: 'Mutable state is reconstructed from typed ledger events.',
    }),
  ]),
  scope: Object.freeze({
    include: Object.freeze([
      'orchestration/lib/run-state.mjs',
      'test/run-state-test.mjs',
    ]),
    exclude: Object.freeze([
      'default install/runtime paths',
      '.fablever_state session summaries',
    ]),
  }),
  allowedActions: Object.freeze([
    'write files beneath the caller-supplied run directory',
    'append typed ledger events',
    'run local checks',
  ]),
  blockers: Object.freeze([]),
  checks: Object.freeze([
    Object.freeze({
      id: 'check.schema',
      criterionId: 'criterion.schema',
      type: 'command',
      definition: 'node test/run-state-test.mjs',
    }),
    Object.freeze({
      id: 'check.authority',
      criterionId: 'criterion.authority',
      type: 'assertion',
      definition: 'ledger replay ignores state.json and preserves open criteria/debt',
    }),
  ]),
});

function receiptFor(runDirectory, {
  id,
  criterionId,
  attemptId,
  recordedAt,
}) {
  const targetPath = `targets/${criterionId}.txt`;
  const artifactPath = `artifacts/${id}.txt`;
  mkdirSync(path.join(runDirectory, 'targets'), { recursive: true });
  mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
  if (!existsSync(path.join(runDirectory, targetPath))) {
    writeFileSync(path.join(runDirectory, targetPath), `target:${criterionId}\n`);
  }
  writeFileSync(path.join(runDirectory, artifactPath), `artifact:${id}\n`);
  const checkDefinition = validContract.checks.find(
    entry => entry.criterionId === criterionId,
  );
  return createEvidenceReceipt(runDirectory, {
    id,
    criterionId,
    attemptId,
    check: {
      id: checkDefinition.id,
      type: checkDefinition.type,
      definition: checkDefinition.definition,
    },
    result: 'pass',
    recordedAt,
    targetRoot: runDirectory,
    targetPaths: [targetPath],
    artifactPath,
  });
}

console.log('run contract + append-only ledger authority (G3.1):');

// (a) Contract schema rejects each named invalid input and accepts a valid v1 contract.
check('contract schema rejects a missing goal', () => {
  const input = clone(validContract);
  delete input.goal;
  assert.throws(() => validateRunContract(input), /goal/);
});

check('contract schema rejects empty criteria', () => {
  const input = clone(validContract);
  input.criteria = [];
  assert.throws(() => validateRunContract(input), /at least one criterion/);
});

check('contract schema rejects duplicate criterion ids', () => {
  const input = clone(validContract);
  input.criteria.push({
    id: input.criteria[0].id,
    description: 'Seeded duplicate.',
  });
  assert.throws(() => validateRunContract(input), /duplicate criterion id/);
});

check('contract schema rejects an absent schema version', () => {
  const input = clone(validContract);
  delete input.schemaVersion;
  assert.throws(() => validateRunContract(input), /schemaVersion/);
});

check('contract schema rejects an unknown schema version', () => {
  const input = clone(validContract);
  input.schemaVersion = RUN_CONTRACT_SCHEMA_VERSION + 1;
  assert.throws(() => validateRunContract(input), /unsupported contract\.schemaVersion/);
});

check('a valid v1 contract is accepted and normalized bidirectionally', () => {
  assert.deepEqual(validateRunContract(clone(validContract)), validContract);
});

const root = mkdtempSync(path.join(tmpdir(), 'fable-run-state-'));
try {
  // (d) Atomic creation: full final file or no final file; partial JSON is never accepted.
  check('contract creation atomically round-trips a complete JSON document', () => {
    const runDirectory = path.join(root, 'atomic-success');
    const created = createRunContract(runDirectory, clone(validContract));
    const raw = readFileSync(path.join(runDirectory, RUN_FILES.contract), 'utf8');
    assert.equal(raw.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(raw), validContract);
    assert.deepEqual(readRunContract(runDirectory), created);
    assert.deepEqual(readdirSync(runDirectory), [RUN_FILES.contract]);
  });

  check('a truncated/partially-written contract is rejected, never half-accepted', () => {
    const runDirectory = path.join(root, 'atomic-partial');
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(
      path.join(runDirectory, RUN_FILES.contract),
      `{"schemaVersion":${RUN_CONTRACT_SCHEMA_VERSION},"runId":"partial"`,
    );
    assert.throws(() => readRunContract(runDirectory), /not complete valid JSON/);
    assert.throws(() => loadRunState(runDirectory), /not complete valid JSON/);
  });

  check('receipt targets exclude only the current run authority and metadata paths', () => {
    const runDirectory = path.join(root, 'receipt-metadata-isolation');
    createRun(runDirectory, clone(validContract), { timestamp: at(20) });
    mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
    mkdirSync(path.join(runDirectory, '.fablever_state'), { recursive: true });
    writeFileSync(path.join(runDirectory, RUN_FILES.cache), '{"cache":true}\n');
    writeFileSync(
      path.join(runDirectory, '.fablever_state', 'sentinel.md'),
      '# non-authoritative session metadata\n',
    );
    writeFileSync(
      path.join(runDirectory, 'artifacts', 'metadata-isolation.txt'),
      'artifact:metadata-isolation\n',
    );
    appendRunEvent(
      runDirectory,
      RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
      {
        criterionId: 'criterion.schema',
        attemptId: 'attempt.metadata-isolation.1',
      },
      { timestamp: at(21) },
    );

    const checkDefinition = validContract.checks[0];
    const receiptInput = {
      criterionId: 'criterion.schema',
      attemptId: 'attempt.metadata-isolation.1',
      check: {
        id: checkDefinition.id,
        type: checkDefinition.type,
        definition: checkDefinition.definition,
      },
      result: 'pass',
      recordedAt: at(21),
      artifactPath: 'artifacts/metadata-isolation.txt',
    };
    const unsafeTargets = [
      { label: RUN_FILES.contract, root: runDirectory, paths: [RUN_FILES.contract] },
      { label: RUN_FILES.ledger, root: runDirectory, paths: [RUN_FILES.ledger] },
      { label: RUN_FILES.cache, root: runDirectory, paths: [RUN_FILES.cache] },
      { label: '.fablever_state', root: runDirectory, paths: ['.fablever_state'] },
      {
        label: '.fablever_state/sentinel.md',
        root: runDirectory,
        paths: ['.fablever_state/sentinel.md'],
      },
      { label: '.', root: runDirectory, paths: ['.'] },
      {
        label: 'parent directory coverage',
        root,
        paths: [path.relative(root, runDirectory).split(path.sep).join('/')],
      },
    ];
    for (const [index, target] of unsafeTargets.entries()) {
      assert.throws(
        () => createEvidenceReceipt(runDirectory, {
          id: `evidence.metadata-rejected.${index}`,
          ...receiptInput,
          targetRoot: target.root,
          targetPaths: target.paths,
        }),
        /must not include run metadata/,
        target.label,
      );
    }

    const hardLinkRoot = path.join(root, 'external-hard-link-aliases');
    mkdirSync(hardLinkRoot, { recursive: true });
    linkSync(
      path.join(runDirectory, RUN_FILES.contract),
      path.join(hardLinkRoot, 'contract-alias.json'),
    );
    linkSync(
      path.join(runDirectory, '.fablever_state', 'sentinel.md'),
      path.join(hardLinkRoot, 'session-alias.md'),
    );
    for (const [index, [targetPath, protectedLabel]] of [
      ['contract-alias.json', RUN_FILES.contract],
      ['session-alias.md', '.fablever_state'],
    ].entries()) {
      assert.throws(
        () => createEvidenceReceipt(runDirectory, {
          id: `evidence.metadata-hard-link-rejected.${index}`,
          ...receiptInput,
          targetRoot: hardLinkRoot,
          targetPaths: [targetPath],
        }),
        new RegExp(`run metadata "${protectedLabel.replace('.', '\\.')}".*hard-link alias`),
      );
    }

    const symlinkRun = path.join(root, 'receipt-metadata-symlink');
    const externalMetadata = path.join(root, 'external-session-metadata');
    createRun(symlinkRun, clone(validContract), { timestamp: at(23) });
    mkdirSync(path.join(symlinkRun, 'artifacts'), { recursive: true });
    mkdirSync(externalMetadata, { recursive: true });
    writeFileSync(
      path.join(symlinkRun, 'artifacts', 'metadata-isolation.txt'),
      'artifact:metadata-symlink-isolation\n',
    );
    writeFileSync(
      path.join(externalMetadata, 'sentinel.md'),
      '# symlinked session metadata\n',
    );
    symlinkSync(externalMetadata, path.join(symlinkRun, '.fablever_state'));
    assert.throws(
      () => createEvidenceReceipt(symlinkRun, {
        id: 'evidence.metadata-symlink-rejected',
        ...receiptInput,
        targetRoot: symlinkRun,
        targetPaths: ['.fablever_state/sentinel.md'],
      }),
      /must not include run metadata ".fablever_state"/,
    );
    const symlinkMetadataAliasRoot = path.join(root, 'symlink-metadata-hard-link');
    mkdirSync(symlinkMetadataAliasRoot, { recursive: true });
    linkSync(
      path.join(externalMetadata, 'sentinel.md'),
      path.join(symlinkMetadataAliasRoot, 'sentinel-alias.md'),
    );
    assert.throws(
      () => createEvidenceReceipt(symlinkRun, {
        id: 'evidence.symlink-metadata-hard-link-rejected',
        ...receiptInput,
        targetRoot: symlinkMetadataAliasRoot,
        targetPaths: ['sentinel-alias.md'],
      }),
      /run metadata ".fablever_state".*hard-link alias/,
    );

    const nestedSymlinkRun = path.join(root, 'receipt-nested-metadata-symlink');
    const nestedMetadata = path.join(root, 'nested-external-session-metadata');
    const nestedAliasRoot = path.join(root, 'nested-metadata-hard-link');
    createRun(nestedSymlinkRun, clone(validContract), { timestamp: at(24) });
    mkdirSync(path.join(nestedSymlinkRun, 'artifacts'), { recursive: true });
    mkdirSync(path.join(nestedSymlinkRun, '.fablever_state'), { recursive: true });
    mkdirSync(nestedMetadata, { recursive: true });
    mkdirSync(nestedAliasRoot, { recursive: true });
    writeFileSync(
      path.join(nestedSymlinkRun, 'artifacts', 'metadata-isolation.txt'),
      'artifact:nested-metadata-symlink-isolation\n',
    );
    writeFileSync(path.join(nestedMetadata, 'secret.md'), '# nested metadata\n');
    symlinkSync(
      nestedMetadata,
      path.join(nestedSymlinkRun, '.fablever_state', 'nested-link'),
    );
    linkSync(
      path.join(nestedMetadata, 'secret.md'),
      path.join(nestedAliasRoot, 'secret-alias.md'),
    );
    assert.throws(
      () => createEvidenceReceipt(nestedSymlinkRun, {
        id: 'evidence.nested-metadata-hard-link-rejected',
        ...receiptInput,
        targetRoot: nestedAliasRoot,
        targetPaths: ['secret-alias.md'],
      }),
      /run metadata ".fablever_state".*hard-link alias/,
    );

    const unreadableRun = path.join(root, 'receipt-unreadable-metadata');
    const unreadableAliasRoot = path.join(root, 'unreadable-metadata-hard-link');
    createRun(unreadableRun, clone(validContract), { timestamp: at(25) });
    mkdirSync(path.join(unreadableRun, 'artifacts'), { recursive: true });
    mkdirSync(path.join(unreadableRun, '.fablever_state'), { recursive: true });
    mkdirSync(unreadableAliasRoot, { recursive: true });
    writeFileSync(
      path.join(unreadableRun, 'artifacts', 'metadata-isolation.txt'),
      'artifact:unreadable-metadata-isolation\n',
    );
    writeFileSync(
      path.join(unreadableRun, '.fablever_state', 'secret.md'),
      '# unreadable metadata\n',
    );
    linkSync(
      path.join(unreadableRun, '.fablever_state', 'secret.md'),
      path.join(unreadableAliasRoot, 'secret-alias.md'),
    );
    const unreadableMetadataPath = path.join(unreadableRun, '.fablever_state');
    chmodSync(unreadableMetadataPath, 0o000);
    try {
      let metadataIsUnreadable = false;
      try {
        readdirSync(unreadableMetadataPath);
      } catch (error) {
        metadataIsUnreadable = error?.code === 'EACCES';
      }
      if (metadataIsUnreadable) {
        assert.throws(
          () => createEvidenceReceipt(unreadableRun, {
            id: 'evidence.unreadable-metadata-rejected',
            ...receiptInput,
            targetRoot: unreadableAliasRoot,
            targetPaths: ['secret-alias.md'],
          }),
          /cannot inspect protected run metadata ".fablever_state"/,
        );
      }
    } finally {
      chmodSync(unreadableMetadataPath, 0o700);
    }

    const externalRoot = path.join(root, 'external-workspace');
    mkdirSync(externalRoot, { recursive: true });
    writeFileSync(
      path.join(externalRoot, RUN_FILES.contract),
      'external workspace contract-like artifact\n',
    );
    const externalReceipt = createEvidenceReceipt(runDirectory, {
      id: 'evidence.external-contract',
      ...receiptInput,
      targetRoot: externalRoot,
      targetPaths: [RUN_FILES.contract],
    });
    assert.deepEqual(externalReceipt.target.paths, [RUN_FILES.contract]);
    assert.equal(externalReceipt.target.root, externalRoot);

    const importedSelfTarget = {
      ...externalReceipt,
      id: 'evidence.imported-self-target',
      target: computeTargetIdentity(runDirectory, [RUN_FILES.contract]),
    };
    const ledgerBeforeImport = readFileSync(
      path.join(runDirectory, RUN_FILES.ledger),
      'utf8',
    );
    assert.throws(
      () => recordCriterionEvidence(
        runDirectory,
        importedSelfTarget,
        { timestamp: at(22) },
      ),
      /must not include run metadata/,
    );
    assert.equal(
      readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'),
      ledgerBeforeImport,
    );
  });

  // (b) All mutable state is a typed event and pure replay needs only ledger rows.
  const authorityRun = path.join(root, 'ledger-authority');
  createRun(authorityRun, clone(validContract), { timestamp: at(0) });
  const initialLedger = readFileSync(path.join(authorityRun, RUN_FILES.ledger), 'utf8');

  check('run creation seeds only contract.json + ledger.jsonl, with no state cache', () => {
    assert.deepEqual(
      readdirSync(authorityRun).sort(),
      [RUN_FILES.contract, RUN_FILES.ledger].sort(),
    );
    assert.equal(existsSync(path.join(authorityRun, RUN_FILES.cache)), false);
  });

  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
    { criterionId: 'criterion.schema', attemptId: 'attempt.schema.1' },
    { timestamp: at(1) },
  );
  const schemaReceipt1 = receiptFor(authorityRun, {
    id: 'evidence.schema.1',
    criterionId: 'criterion.schema',
    attemptId: 'attempt.schema.1',
    recordedAt: at(1),
  });
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    { receipt: schemaReceipt1 },
    { timestamp: at(1) },
  );
  const afterFirstAppend = readFileSync(path.join(authorityRun, RUN_FILES.ledger), 'utf8');
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_COMPLETED,
    { criterionId: 'criterion.schema', receiptId: schemaReceipt1.id },
    { timestamp: at(2) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_REOPENED,
    { criterionId: 'criterion.schema', reason: 'target changed' },
    { timestamp: at(3) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
    { criterionId: 'criterion.schema', attemptId: 'attempt.schema.2' },
    { timestamp: at(4) },
  );
  const schemaReceipt2 = receiptFor(authorityRun, {
    id: 'evidence.schema.2',
    criterionId: 'criterion.schema',
    attemptId: 'attempt.schema.2',
    recordedAt: at(4),
  });
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    { receipt: schemaReceipt2 },
    { timestamp: at(4) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.CRITERION_COMPLETED,
    { criterionId: 'criterion.schema', receiptId: schemaReceipt2.id },
    { timestamp: at(5) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId: 'debt.resolved',
      criterionId: 'criterion.authority',
      description: 'Seeded debt that will be resolved.',
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: at(6) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.DEBT_RESOLVED,
    {
      debtId: 'debt.resolved',
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: at(7) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId: 'debt.open',
      criterionId: 'criterion.authority',
      description: 'The second criterion still lacks completion evidence.',
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: at(8) },
  );
  appendRunEvent(
    authorityRun,
    RUN_EVENT_TYPES.RUN_HALTED,
    { reason: 'open verification debt remains' },
    { timestamp: at(9) },
  );

  const finalLedger = readFileSync(path.join(authorityRun, RUN_FILES.ledger), 'utf8');
  const rawEvents = finalLedger.slice(0, -1).split('\n').map(JSON.parse);

  check('ledger writes are append-only and retain every prior byte as a prefix', () => {
    assert.equal(afterFirstAppend.startsWith(initialLedger), true);
    assert.equal(finalLedger.startsWith(afterFirstAppend), true);
  });

  check('every persisted state transition has a known type and event schema version', () => {
    const knownTypes = new Set(Object.values(RUN_EVENT_TYPES));
    assert.ok(rawEvents.length > validContract.criteria.length);
    for (const event of rawEvents) {
      assert.equal(event.schemaVersion, RUN_LEDGER_EVENT_SCHEMA_VERSION);
      assert.equal(knownTypes.has(event.type), true, event.type);
      assert.equal(Number.isInteger(event.sequence), true);
    }
  });

  check('replaying ledger rows alone reconstructs open/complete criteria, debt, and halt state', () => {
    const state = replayRunLedger(rawEvents);
    assert.equal(state.source, 'ledger');
    assert.deepEqual(state.openCriteria, ['criterion.authority']);
    assert.deepEqual(state.completeCriteria, ['criterion.schema']);
    assert.deepEqual(state.debt.open.map(entry => entry.id), ['debt.open']);
    assert.deepEqual(state.debt.resolved.map(entry => entry.id), ['debt.resolved']);
    assert.deepEqual(
      state.criteria.find(entry => entry.id === 'criterion.schema').evidenceIds,
      ['evidence.schema.1', 'evidence.schema.2'],
    );
    assert.equal(state.halted, true);
    assert.equal(state.haltReason, 'open verification debt remains');
    assert.equal(state.complete, false);
  });

  check('an unknown event type is rejected before any ledger byte is appended', () => {
    const runDirectory = path.join(root, 'typed-events');
    createRun(runDirectory, clone(validContract), { timestamp: at(10) });
    const before = readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8');
    assert.throws(
      () => appendRunEvent(
        runDirectory,
        'criterion.forged',
        { criterionId: 'criterion.schema' },
        { timestamp: at(11) },
      ),
      /unknown run ledger event type/,
    );
    assert.equal(readFileSync(path.join(runDirectory, RUN_FILES.ledger), 'utf8'), before);
  });

  check('a truncated JSONL event is rejected instead of silently skipped', () => {
    const runDirectory = path.join(root, 'truncated-ledger');
    createRun(runDirectory, clone(validContract), { timestamp: at(12) });
    const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
    const complete = readFileSync(ledgerPath, 'utf8');
    writeFileSync(ledgerPath, complete.slice(0, -1));
    assert.throws(() => readRunLedger(runDirectory), /truncated final event/);
  });

  // (c) state.json can exist as a cache, but it cannot forge completion or erase debt.
  check('a doctored state.json cannot forge criterion completion or erase ledger debt', () => {
    const runDirectory = path.join(root, 'forged-cache');
    createRun(runDirectory, clone(validContract), { timestamp: at(13) });
    appendRunEvent(
      runDirectory,
      RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
      { criterionId: 'criterion.schema', attemptId: 'attempt.cache.1' },
      { timestamp: at(14) },
    );
    const cacheReceipt = receiptFor(runDirectory, {
      id: 'evidence.cache.1',
      criterionId: 'criterion.schema',
      attemptId: 'attempt.cache.1',
      recordedAt: at(14),
    });
    appendRunEvent(
      runDirectory,
      RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
      { receipt: cacheReceipt },
      { timestamp: at(14) },
    );
    appendRunEvent(
      runDirectory,
      RUN_EVENT_TYPES.CRITERION_COMPLETED,
      { criterionId: 'criterion.schema', receiptId: cacheReceipt.id },
      { timestamp: at(15) },
    );
    appendRunEvent(
      runDirectory,
      RUN_EVENT_TYPES.DEBT_ADDED,
      {
        debtId: 'debt.cache-cannot-hide',
        criterionId: 'criterion.authority',
        description: 'Must remain open until a ledger event resolves it.',
        boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      },
      { timestamp: at(16) },
    );
    writeFileSync(path.join(runDirectory, RUN_FILES.cache), JSON.stringify({
      complete: true,
      openCriteria: [],
      completeCriteria: ['criterion.schema', 'criterion.authority'],
      debt: { open: [] },
    }));

    const state = loadRunState(runDirectory);
    assert.equal(state.source, 'ledger');
    assert.equal(state.complete, false);
    assert.deepEqual(state.openCriteria, ['criterion.authority']);
    assert.deepEqual(state.completeCriteria, ['criterion.schema']);
    assert.deepEqual(state.debt.open.map(entry => entry.id), ['debt.cache-cannot-hide']);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
