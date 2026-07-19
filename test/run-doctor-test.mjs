#!/usr/bin/env node
// G4.2 bidirectional oracle for deterministic, report-only active-run diagnostics.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
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
import { inspectPlanArtifact } from '../orchestration/lib/plan-artifact.mjs';
import {
  RUN_CONTRACT_SCHEMA_VERSION,
  RUN_EVENT_TYPES,
  RUN_FILES,
  RUN_LEDGER_EVENT_SCHEMA_VERSION,
  completeCriterion,
  createEvidenceReceipt,
  createRun,
  readRunLedger,
  recordCriterionEvidence,
  startCriterionAttempt,
} from '../orchestration/lib/run-state.mjs';
import {
  RUN_DOCTOR_INVARIANTS,
  RUN_DOCTOR_SCHEMA_VERSION,
  diagnoseActiveRun,
  validateRunDoctorReport,
} from '../orchestration/lib/run-doctor.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCTOR_CLI = path.join(REPO, 'tools', 'fable-run-doctor.mjs');
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
  return new Date(Date.UTC(2026, 6, 17, 5, 0, clockTick++)).toISOString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function snapshotTree(root, directory = root, output = {}) {
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const metadata = lstatSync(absolute, { bigint: true });
    if (entry.isDirectory()) {
      output[relative] = {
        type: 'directory',
        mode: Number(metadata.mode),
        mtimeNs: metadata.mtimeNs.toString(),
      };
      snapshotTree(root, absolute, output);
    } else {
      const bytes = readFileSync(absolute);
      output[relative] = {
        type: 'file',
        mode: Number(metadata.mode),
        mtimeNs: metadata.mtimeNs.toString(),
        size: bytes.length,
        sha256: sha256(bytes),
      };
    }
  }
  return output;
}

function writeRawEvent(runDirectory, type, payload) {
  const events = readRunLedger(runDirectory);
  const event = {
    schemaVersion: RUN_LEDGER_EVENT_SCHEMA_VERSION,
    sequence: events.length + 1,
    timestamp: now(),
    type,
    payload,
  };
  appendFileSync(
    path.join(runDirectory, RUN_FILES.ledger),
    `${JSON.stringify(event)}\n`,
  );
  return event;
}

function checkDefinition(criterionId) {
  return {
    id: `check.${criterionId}`,
    criterionId,
    type: 'command',
    definition: `node checks/${criterionId}.mjs`,
  };
}

function createFixture(root, name, criterionId, plan = null) {
  const runDirectory = path.join(root, 'runs', name);
  const check = checkDefinition(criterionId);
  createRun(runDirectory, {
    schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
    runId: `g4.2-${name}`,
    goal: `Diagnose ${name} without mutating the active run.`,
    criteria: [{
      id: criterionId,
      description: `Seeded ${name} criterion with exact execution evidence.`,
    }],
    scope: {
      include: [`targets/${criterionId}.txt`],
      exclude: ['plan rewrite', 'state mutation', 'automatic recovery'],
    },
    allowedActions: [
      'read contract.json and ledger.jsonl',
      'read receipt target and artifact bytes',
      'report facts and a safe next action',
    ],
    blockers: [],
    checks: [check],
    ...(plan ? { planPath: plan.path, planHash: plan.sha256 } : {}),
  }, { timestamp: now() });

  mkdirSync(path.join(runDirectory, 'checks'), { recursive: true });
  writeFileSync(
    path.join(runDirectory, 'checks', `${criterionId}.mjs`),
    'process.exit(0);\n',
  );
  writeFileSync(
    path.join(runDirectory, RUN_FILES.cache),
    '{"forged":true,"complete":true}\n',
  );
  mkdirSync(path.join(runDirectory, '.fablever_state'), { recursive: true });
  writeFileSync(
    path.join(runDirectory, '.fablever_state', 'sentinel.md'),
    '# forged non-authoritative handoff\n',
  );
  return { runDirectory, check };
}

function completeFixture(runDirectory, criterionId, check, suffix) {
  const attemptId = `attempt.${suffix}.1`;
  const receiptId = `receipt.${suffix}.1`;
  const targetPath = `targets/${criterionId}.txt`;
  const artifactPath = `artifacts/${receiptId}.txt`;
  mkdirSync(path.join(runDirectory, 'targets'), { recursive: true });
  mkdirSync(path.join(runDirectory, 'artifacts'), { recursive: true });
  writeFileSync(path.join(runDirectory, targetPath), `target:${suffix}:v1\n`);
  writeFileSync(path.join(runDirectory, artifactPath), `artifact:${suffix}\n`);
  startCriterionAttempt(
    runDirectory,
    criterionId,
    attemptId,
    { timestamp: now() },
  );
  const receipt = createEvidenceReceipt(runDirectory, {
    id: receiptId,
    criterionId,
    attemptId,
    check: {
      id: check.id,
      type: check.type,
      definition: check.definition,
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
  return { attemptId, receipt, targetPath, artifactPath };
}

function diagnostic(report, invariant) {
  const finding = report.diagnostics.find(entry => entry.invariant === invariant);
  assert.ok(finding, `missing diagnostic ${invariant}`);
  return finding;
}

function assertSpecific(report, {
  invariant,
  criterionId,
  file,
  actionPattern,
}) {
  validateRunDoctorReport(report);
  const finding = diagnostic(report, invariant);
  assert.equal(finding.criterionId, criterionId);
  assert.equal(finding.responsibleFile, file);
  assert.match(finding.observed, new RegExp(
    criterionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ));
  assert.match(finding.safeNextAction, actionPattern);
  assert.doesNotMatch(finding.observed, /^(state|run|ledger) invalid$/i);
  return finding;
}

function diagnoseApiAndCli(root, runDirectory) {
  const before = snapshotTree(root);
  const apiReport = diagnoseActiveRun(runDirectory);
  const child = spawnSync(
    process.execPath,
    [DOCTOR_CLI, runDirectory, '--json'],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: {
        ...process.env,
        LANG: 'C',
        LC_ALL: 'C',
      },
      windowsHide: true,
    },
  );
  assert.equal(
    child.status,
    0,
    `doctor CLI failed:\n${child.stderr || child.stdout}`,
  );
  assert.equal(child.stderr, '');
  const cliReport = JSON.parse(child.stdout);
  assert.deepEqual(cliReport, apiReport);
  assert.deepEqual(
    snapshotTree(root),
    before,
    'doctor API/CLI changed a file, directory, mode, mtime, digest, or entry',
  );
  return apiReport;
}

console.log('active-run doctor execution diagnostics (G4.2):');

const root = mkdtempSync(path.join(tmpdir(), 'fable-run-doctor-'));
try {
  const planPath = path.join(root, 'plans', 'doctor-fixture.md');
  mkdirSync(path.dirname(planPath), { recursive: true });
  writeFileSync(planPath, `# Plan: active-run doctor fixture

<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->

## Outcome

Keep a bound plan byte-identical while the read-only doctor diagnoses seeded state.

## Scope

### In

- Temporary contract, ledger, receipts, targets, artifacts, and sentinels.

### Out

- Any doctor write or automatic repair.

## Criteria

- Every diagnostic names its invariant, criterion, file, and safe next action.

## Ordered dependencies

1. Seed the authoritative state.
2. Diagnose it without mutation.

## Risky assumptions

- Filesystem metadata can expose accidental writes.

## Non-goals

- Rewrite the plan or repair the ledger.
`);
  const plan = inspectPlanArtifact(planPath);

  const stale = createFixture(
    root,
    'stale-receipt',
    'criterion.stale',
    plan,
  );
  const staleCompletion = completeFixture(
    stale.runDirectory,
    'criterion.stale',
    stale.check,
    'stale',
  );
  writeFileSync(
    path.join(stale.runDirectory, staleCompletion.targetPath),
    'target:stale:v2\n',
  );

  const illegal = createFixture(
    root,
    'illegal-transition',
    'criterion.illegal',
    plan,
  );
  const illegalEvent = writeRawEvent(
    illegal.runDirectory,
    RUN_EVENT_TYPES.CRITERION_REOPENED,
    {
      criterionId: 'criterion.illegal',
      reason: 'seeded illegal reopen while still open',
    },
  );

  const partial = createFixture(
    root,
    'partial-attempt',
    'criterion.partial',
    plan,
  );
  startCriterionAttempt(
    partial.runDirectory,
    'criterion.partial',
    'attempt.partial.1',
    { timestamp: now() },
  );

  const conflict = createFixture(
    root,
    'conflicting-completion',
    'criterion.conflict',
    plan,
  );
  const firstCompletion = completeFixture(
    conflict.runDirectory,
    'criterion.conflict',
    conflict.check,
    'conflict',
  );
  const conflictingEvent = writeRawEvent(
    conflict.runDirectory,
    RUN_EVENT_TYPES.CRITERION_COMPLETED,
    {
      criterionId: 'criterion.conflict',
      receiptId: 'receipt.conflict.2',
    },
  );

  const binding = createFixture(
    root,
    'contract-ledger-conflict',
    'criterion.binding',
    plan,
  );
  const bindingLedgerPath = path.join(
    binding.runDirectory,
    RUN_FILES.ledger,
  );
  const bindingEvents = readFileSync(bindingLedgerPath, 'utf8')
    .slice(0, -1)
    .split('\n')
    .map(JSON.parse);
  bindingEvents[0].payload.runId = 'g4.2-conflicting-run-id';
  writeFileSync(
    bindingLedgerPath,
    `${bindingEvents.map(entry => JSON.stringify(entry)).join('\n')}\n`,
  );

  const unreadableContractDirectory = path.join(
    root,
    'runs',
    'unreadable-contract',
  );
  mkdirSync(unreadableContractDirectory, { recursive: true });
  writeFileSync(
    path.join(unreadableContractDirectory, RUN_FILES.contract),
    `{"schemaVersion":${RUN_CONTRACT_SCHEMA_VERSION},"runId":"partial"`,
  );
  writeFileSync(
    path.join(unreadableContractDirectory, RUN_FILES.ledger),
    '{"partial":"sentinel"}\n',
  );

  const unrelatedPlanId = createFixture(
    root,
    'unrelated-plan-id',
    'criterion.unrelated',
  );
  mkdirSync(path.join(unrelatedPlanId.runDirectory, 'targets'), { recursive: true });
  mkdirSync(path.join(unrelatedPlanId.runDirectory, 'artifacts'), { recursive: true });
  writeFileSync(
    path.join(unrelatedPlanId.runDirectory, 'targets', 'criterion.unrelated.txt'),
    'target:unrelated-plan-id:v1\n',
  );
  writeFileSync(
    path.join(unrelatedPlanId.runDirectory, 'artifacts', 'receipt.plan.bad.txt'),
    'artifact:receipt.plan.bad\n',
  );
  startCriterionAttempt(
    unrelatedPlanId.runDirectory,
    'criterion.unrelated',
    'attempt.unrelated.1',
    { timestamp: now() },
  );
  const unrelatedReceipt = createEvidenceReceipt(unrelatedPlanId.runDirectory, {
    id: 'receipt.plan.bad',
    criterionId: 'criterion.unrelated',
    attemptId: 'attempt.unrelated.1',
    check: {
      id: unrelatedPlanId.check.id,
      type: unrelatedPlanId.check.type,
      definition: unrelatedPlanId.check.definition,
    },
    result: 'pass',
    recordedAt: now(),
    targetRoot: unrelatedPlanId.runDirectory,
    targetPaths: ['targets/criterion.unrelated.txt'],
    artifactPath: 'artifacts/receipt.plan.bad.txt',
  });
  writeRawEvent(
    unrelatedPlanId.runDirectory,
    RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    {
      receipt: {
        ...unrelatedReceipt,
        runId: 'g4.2-unrelated-foreign-run',
      },
    },
  );

  const divergentPlanPath = path.join(root, 'plans', 'doctor-divergent.md');
  writeFileSync(divergentPlanPath, readFileSync(planPath));
  const divergentPlan = inspectPlanArtifact(divergentPlanPath);
  const divergent = createFixture(
    root,
    'silent-plan-divergence',
    'criterion.divergent',
    divergentPlan,
  );
  writeFileSync(
    divergentPlanPath,
    readFileSync(divergentPlanPath, 'utf8').replace(
      'Keep a bound plan byte-identical',
      'Keep a deliberately revised bound plan explicit',
    ),
  );

  const originalTree = snapshotTree(root);
  const planBytes = readFileSync(planPath);

  await check('stale receipt names its criterion, receipt, check, invariant, file, and reopen action', () => {
    const report = diagnoseApiAndCli(root, stale.runDirectory);
    assert.equal(report.status, 'blocked');
    const targetFile = path.join(
      stale.runDirectory,
      staleCompletion.targetPath,
    );
    const finding = assertSpecific(report, {
      invariant: RUN_DOCTOR_INVARIANTS.COMPLETION_RECEIPT_CURRENT,
      criterionId: 'criterion.stale',
      file: targetFile,
      actionPattern: /criterion\.reopened.*check\.criterion\.stale.*fresh.*PASS/i,
    });
    assert.equal(finding.receiptId, staleCompletion.receipt.id);
    assert.equal(finding.checkId, stale.check.id);
    assert.equal(finding.staleReason, 'target_hash_mismatch');
    assert.deepEqual(finding.targetPaths, [targetFile]);
  });

  await check('illegal transition names the exact event, sequence, prior state, criterion, and safe stop', () => {
    const report = diagnoseApiAndCli(root, illegal.runDirectory);
    assert.equal(report.status, 'invalid');
    const finding = assertSpecific(report, {
      invariant: RUN_DOCTOR_INVARIANTS.LEDGER_TRANSITION_LEGAL,
      criterionId: 'criterion.illegal',
      file: path.join(illegal.runDirectory, RUN_FILES.ledger),
      actionPattern: new RegExp(`last valid sequence ${illegalEvent.sequence - 1}.*do not rewrite`, 'i'),
    });
    assert.equal(finding.eventType, RUN_EVENT_TYPES.CRITERION_REOPENED);
    assert.equal(finding.eventSequence, illegalEvent.sequence);
    assert.equal(finding.line, illegalEvent.sequence);
    assert.equal(finding.priorCriterionStatus, 'open');
    assert.match(finding.observed, /requires complete criterion.*found open/i);
  });

  await check('partial active attempt names the missing receipt invariant and exact contract check', () => {
    const report = diagnoseApiAndCli(root, partial.runDirectory);
    assert.equal(report.status, 'blocked');
    const finding = assertSpecific(report, {
      invariant: RUN_DOCTOR_INVARIANTS.CURRENT_ATTEMPT_EVIDENCE_REQUIRED,
      criterionId: 'criterion.partial',
      file: path.join(partial.runDirectory, RUN_FILES.ledger),
      actionPattern: /check\.criterion\.partial.*record.*receipt.*do not append criterion\.completed/i,
    });
    assert.equal(finding.attemptId, 'attempt.partial.1');
    assert.equal(finding.checkId, partial.check.id);
    assert.equal(finding.checkDefinition, partial.check.definition);
    assert.match(finding.observed, /no evidence receipt/i);
  });

  await check('conflicting completion names both events and receipts instead of choosing a winner', () => {
    const report = diagnoseApiAndCli(root, conflict.runDirectory);
    assert.equal(report.status, 'invalid');
    const finding = assertSpecific(report, {
      invariant: RUN_DOCTOR_INVARIANTS.CRITERION_COMPLETION_NONCONFLICTING,
      criterionId: 'criterion.conflict',
      file: path.join(conflict.runDirectory, RUN_FILES.ledger),
      actionPattern: /preserve both files.*do not choose a completion.*rewrite ledger rows/i,
    });
    assert.equal(finding.eventSequence, conflictingEvent.sequence);
    assert.equal(finding.eventType, RUN_EVENT_TYPES.CRITERION_COMPLETED);
    assert.equal(finding.priorReceiptId, firstCompletion.receipt.id);
    assert.equal(finding.receiptId, 'receipt.conflict.2');
    assert.match(
      finding.observed,
      new RegExp(
        `sequence ${conflictingEvent.sequence}.*sequence ${conflictingEvent.sequence - 1}`,
      ),
    );
  });

  await check('contract-created conflict is named before a downstream replay error can mask it', () => {
    const report = diagnoseApiAndCli(root, binding.runDirectory);
    assert.equal(report.status, 'invalid');
    const finding = assertSpecific(report, {
      invariant: RUN_DOCTOR_INVARIANTS.CONTRACT_LEDGER_BINDING,
      criterionId: 'criterion.binding',
      file: bindingLedgerPath,
      actionPattern: /same atomic run creation.*do not merge or rewrite/i,
    });
    assert.equal(finding.eventSequence, 1);
    assert.equal(finding.eventType, RUN_EVENT_TYPES.CONTRACT_CREATED);
    assert.match(finding.observed, /conflicts.*runId/i);
  });

  await check('an unreadable contract reports that no criterion id is knowable instead of inventing one', () => {
    const report = diagnoseApiAndCli(root, unreadableContractDirectory);
    assert.equal(report.status, 'invalid');
    const finding = diagnostic(
      report,
      RUN_DOCTOR_INVARIANTS.CONTRACT_COMPLETE,
    );
    assert.equal(finding.criterionId, null);
    assert.deepEqual(finding.criterionIds, []);
    assert.match(finding.criterionUnavailableReason, /no criterion id is authoritative/);
    assert.equal(
      finding.responsibleFile,
      path.join(unreadableContractDirectory, RUN_FILES.contract),
    );
    assert.match(finding.safeNextAction, /restore a complete contract\.json.*new run atomically/i);
  });

  await check('an unrelated receipt id containing plan is not misclassified on a plan-less contract', () => {
    const report = diagnoseApiAndCli(root, unrelatedPlanId.runDirectory);
    assert.equal(report.status, 'invalid');
    const finding = diagnostic(
      report,
      RUN_DOCTOR_INVARIANTS.AUTHORITATIVE_STATE_DERIVABLE,
    );
    assert.equal(finding.criterionId, 'criterion.unrelated');
    assert.equal(finding.receiptId, 'receipt.plan.bad');
    assert.equal(
      finding.responsibleFile,
      path.join(unrelatedPlanId.runDirectory, RUN_FILES.ledger),
    );
    assert.match(finding.observed, /receipt\.plan\.bad/);
    assert.doesNotMatch(finding.safeNextAction, /plan\.rebound|plan divergence/i);
    assert.equal(
      report.diagnostics.some(
        entry => entry.invariant === RUN_DOCTOR_INVARIANTS.PLAN_BINDING_EXPLICIT,
      ),
      false,
    );
  });

  await check('a genuine silent bound-plan divergence keeps precise plan-rebind advice', () => {
    const report = diagnoseApiAndCli(root, divergent.runDirectory);
    assert.equal(report.status, 'invalid');
    const finding = diagnostic(
      report,
      RUN_DOCTOR_INVARIANTS.PLAN_BINDING_EXPLICIT,
    );
    assert.equal(finding.criterionId, 'criterion.divergent');
    assert.equal(finding.responsibleFile, divergentPlanPath);
    assert.match(finding.observed, /^silent plan divergence:/i);
    assert.match(finding.safeNextAction, /plan\.rebound.*human review/i);
  });

  await check('a vague state-invalid report is structurally rejected', () => {
    assert.throws(
      () => validateRunDoctorReport({
        schemaVersion: RUN_DOCTOR_SCHEMA_VERSION,
        status: 'invalid',
        runDirectory: '/tmp/vague-run',
        source: 'state',
        reportOnly: true,
        selectedCriterion: null,
        summary: 'state invalid',
        diagnostics: [{
          invariant: 'state-invalid',
          severity: 'error',
          criterionId: null,
          criterionIds: [],
          responsibleFile: '',
          observed: 'state invalid',
          safeNextAction: 'fix it',
        }],
      }),
      /specific violated invariant/,
    );
  });

  await check('doctor source contains no mutation/recovery API and remains opt-in', () => {
    const source = readFileSync(
      path.join(REPO, 'orchestration/lib/run-doctor.mjs'),
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /\b(?:appendRunEvent|completeCriterion|startCriterionAttempt|recordCriterionEvidence|recoverRunFromAuthority|writeFileSync|appendFileSync|renameSync|rmSync|mkdirSync)\b/,
    );
    const defaultSurfaces = [
      path.join(REPO, 'install.mjs'),
      path.join(REPO, 'install.sh'),
      path.join(REPO, 'mcp', 'src', 'server.js'),
    ];
    // The installers prune this opt-in module from the default runtime footprint;
    // a filename in that removal list is not an import, call, or CLI invocation.
    const forbiddenInvocation = /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*run-doctor\.mjs|diagnoseActiveRun\s*\(|node[^\n]*run-doctor\.mjs/;
    for (const file of defaultSurfaces) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), forbiddenInvocation);
    }
  });

  await check('API and CLI perform zero writes, plan rewrites, cache mutations, or new-file creation', () => {
    assert.deepEqual(snapshotTree(root), originalTree);
    assert.deepEqual(readFileSync(planPath), planBytes);
    for (const fixture of [
      stale,
      illegal,
      partial,
      conflict,
      binding,
      unrelatedPlanId,
      divergent,
    ]) {
      assert.equal(
        readFileSync(
          path.join(fixture.runDirectory, RUN_FILES.cache),
          'utf8',
        ),
        '{"forged":true,"complete":true}\n',
      );
      assert.equal(
        readFileSync(
          path.join(
            fixture.runDirectory,
            '.fablever_state',
            'sentinel.md',
          ),
          'utf8',
        ),
        '# forged non-authoritative handoff\n',
      );
    }
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exitCode = failed === 0 ? 0 : 1;
