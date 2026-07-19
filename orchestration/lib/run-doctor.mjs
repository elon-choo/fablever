// Deterministic, read-only diagnostics for one G3.1/G3.2/G3.5 run directory.
// This module never calls an append, recovery, completion, or plan-writing API.
// It is inert until explicitly imported and called. Zero dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  RUN_EVENT_TYPES,
  RUN_FILES,
  loadRunState,
  readRunContract,
  replayRunLedger,
} from './run-state.mjs';
import { VERIFIED_LOOP_STATES } from './verified-loop.mjs';

export const RUN_DOCTOR_SCHEMA_VERSION = 1;

export const RUN_DOCTOR_INVARIANTS = Object.freeze({
  CONTRACT_COMPLETE: 'contract-complete-valid-json',
  LEDGER_COMPLETE: 'ledger-complete-jsonl',
  LEDGER_INITIALIZATION_COMPLETE: 'ledger-initialization-complete',
  LEDGER_TRANSITION_LEGAL: 'ledger-transition-legal',
  LEDGER_EVENT_IDENTITY_UNIQUE: 'ledger-event-identity-unique',
  CONTRACT_LEDGER_BINDING: 'contract-ledger-binding',
  CRITERION_COMPLETION_NONCONFLICTING: 'criterion-completion-nonconflicting',
  COMPLETION_RECEIPT_CURRENT: 'completion-receipt-current',
  CURRENT_ATTEMPT_EVIDENCE_REQUIRED: 'current-attempt-evidence-required',
  CURRENT_ATTEMPT_PASS_REQUIRED: 'current-attempt-pass-required',
  CRITERION_COMPLETION_EVENT_REQUIRED: 'criterion-completion-event-required',
  VERIFIED_LOOP_RECOVERY_REQUIRED: 'verified-loop-recovery-required',
  RUN_HALT_TERMINAL: 'run-halt-terminal',
  AUTHORITATIVE_STATE_DERIVABLE: 'authoritative-state-derivable',
  PLAN_BINDING_EXPLICIT: 'plan-binding-explicit',
});

const REPORT_STATUSES = new Set([
  'complete',
  'ready',
  'blocked',
  'halted',
  'invalid',
]);
const GENERIC_INVARIANTS = new Set([
  'invalid',
  'state-invalid',
  'run-invalid',
  'ledger-invalid',
]);
const GENERIC_ACTIONS = new Set([
  'fix it',
  'repair it',
  'retry',
  'try again',
  'check state',
]);
const INCOMPLETE_INITIALIZATION = /ledger initialization is incomplete/;
const PLAN_DERIVATION_FAILURE =
  /^(?:bound plan artifact (?:is invalid|hash mismatch):|silent plan divergence:)/i;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function plainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function freezeStrings(values) {
  return Object.freeze([...new Set(values.filter(Boolean))]);
}

function contractCriterion(contract, criterionId) {
  return contract?.criteria.find(entry => entry.id === criterionId) || null;
}

function eventCriterionId(event) {
  return event?.payload?.criterionId
    || event?.payload?.receipt?.criterionId
    || null;
}

function eventReceiptId(event) {
  return event?.payload?.receiptId
    || event?.payload?.receipt?.id
    || null;
}

function criterionContext(contract, criterionId) {
  const criterion = contractCriterion(contract, criterionId);
  return {
    criterionId: criterionId || null,
    criterionDescription: criterion?.description || null,
  };
}

function makeFinding({
  invariant,
  severity,
  observed,
  safeNextAction,
  responsibleFile,
  authorityFiles = [],
  contract,
  criterionId = null,
  criterionIds = [],
  ...details
}) {
  return Object.freeze({
    invariant,
    severity,
    ...criterionContext(contract, criterionId),
    criterionIds: freezeStrings(criterionIds),
    responsibleFile,
    authorityFiles: freezeStrings(authorityFiles),
    observed,
    safeNextAction,
    ...details,
  });
}

function reportStatus(findings, state) {
  if (findings.some(entry => entry.severity === 'error')) return 'invalid';
  if (state?.halted) return 'halted';
  if (findings.length > 0) return 'blocked';
  if (state?.complete) return 'complete';
  return 'ready';
}

function selectedCriterion(contract, state) {
  const criterionId = state?.openCriteria?.[0];
  if (!criterionId) return null;
  const criterion = contractCriterion(contract, criterionId);
  const criterionState = state.criteria.find(entry => entry.id === criterionId);
  const checks = contract.checks.filter(entry => entry.criterionId === criterionId);
  return Object.freeze({
    id: criterionId,
    description: criterion?.description || null,
    status: criterionState?.status || null,
    freshness: criterionState?.freshness || null,
    currentAttemptId: criterionState?.currentAttemptId || null,
    attemptIds: Object.freeze([...(criterionState?.attemptIds || [])]),
    checkIds: Object.freeze(checks.map(entry => entry.id)),
  });
}

function reportSummary(status, selected, findings) {
  if (status === 'invalid') {
    return `${findings.length} authoritative run invariant(s) failed.`;
  }
  if (status === 'halted') {
    return `Run is terminally halted${selected ? ` with criterion ${selected.id} unresolved` : ''}.`;
  }
  if (status === 'blocked') {
    return `${findings.length} specific blocker(s) affect criterion ${selected?.id || findings[0].criterionId}.`;
  }
  if (status === 'complete') return 'All contract criteria are complete with no open debt.';
  return selected
    ? `Criterion ${selected.id} is the next ledger-open criterion.`
    : 'No ledger-open criterion was found.';
}

function buildReport(runDirectory, contract, state, findings) {
  const status = reportStatus(findings, state);
  const selected = selectedCriterion(contract, state);
  return validateRunDoctorReport(Object.freeze({
    schemaVersion: RUN_DOCTOR_SCHEMA_VERSION,
    status,
    runDirectory,
    source: 'contract+ledger+current-receipt-inputs',
    reportOnly: true,
    selectedCriterion: selected,
    summary: reportSummary(status, selected, findings),
    diagnostics: Object.freeze(findings),
  }));
}

/**
 * Reject diagnostic payloads that collapse a real fault into "state invalid".
 * File-only corruption may lack a knowable criterion, but must then enumerate
 * the contract criteria whose authority is unavailable.
 */
export function validateRunDoctorReport(input) {
  plainRecord(input, 'run doctor report');
  if (input.schemaVersion !== RUN_DOCTOR_SCHEMA_VERSION) {
    throw new TypeError(
      `run doctor report.schemaVersion must be ${RUN_DOCTOR_SCHEMA_VERSION}`,
    );
  }
  if (!REPORT_STATUSES.has(input.status)) {
    throw new TypeError(`run doctor report.status "${input.status}" is unknown`);
  }
  nonEmptyString(input.runDirectory, 'run doctor report.runDirectory');
  nonEmptyString(input.source, 'run doctor report.source');
  nonEmptyString(input.summary, 'run doctor report.summary');
  if (input.reportOnly !== true) {
    throw new TypeError('run doctor report.reportOnly must be true');
  }
  if (!Array.isArray(input.diagnostics)) {
    throw new TypeError('run doctor report.diagnostics must be an array');
  }

  for (let index = 0; index < input.diagnostics.length; index++) {
    const finding = input.diagnostics[index];
    const label = `run doctor report.diagnostics[${index}]`;
    plainRecord(finding, label);
    const invariant = nonEmptyString(finding.invariant, `${label}.invariant`);
    if (GENERIC_INVARIANTS.has(invariant.trim().toLowerCase())
      || !invariant.includes('-')) {
      throw new TypeError(`${label}.invariant must name the specific violated invariant`);
    }
    if (!['error', 'blocked'].includes(finding.severity)) {
      throw new TypeError(`${label}.severity must be "error" or "blocked"`);
    }
    nonEmptyString(finding.responsibleFile, `${label}.responsibleFile`);
    nonEmptyString(finding.observed, `${label}.observed`);
    const action = nonEmptyString(
      finding.safeNextAction,
      `${label}.safeNextAction`,
    );
    if (GENERIC_ACTIONS.has(action.trim().toLowerCase())) {
      throw new TypeError(`${label}.safeNextAction must name a safe specific action`);
    }
    const hasCriterion = typeof finding.criterionId === 'string'
      && finding.criterionId.trim() !== '';
    const hasCriteria = Array.isArray(finding.criterionIds)
      && finding.criterionIds.length > 0
      && finding.criterionIds.every(entry => (
        typeof entry === 'string' && entry.trim() !== ''
      ));
    const criterionUnavailable = finding.invariant
      === RUN_DOCTOR_INVARIANTS.CONTRACT_COMPLETE
      && typeof finding.criterionUnavailableReason === 'string'
      && finding.criterionUnavailableReason.trim() !== '';
    if (!hasCriterion && !hasCriteria && !criterionUnavailable) {
      throw new TypeError(`${label} must cite the responsible criterion id(s)`);
    }
  }
  return input;
}

function criterionIdsForFileFailure(contract, rawLine = '') {
  const matches = contract.criteria
    .map(entry => entry.id)
    .filter(criterionId => rawLine.includes(criterionId));
  return matches.length > 0
    ? matches
    : contract.criteria.map(entry => entry.id);
}

function contractFailure(runDirectory, error) {
  const contractPath = path.join(runDirectory, RUN_FILES.contract);
  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.CONTRACT_COMPLETE,
    severity: 'error',
    criterionIds: [],
    criterionUnavailableReason: 'contract.json is unreadable, so no criterion id is authoritative',
    responsibleFile: contractPath,
    authorityFiles: [contractPath],
    observed: error.message,
    safeNextAction: `Stop the loop and restore a complete ${RUN_FILES.contract} from the authoritative run creation, or create a new run atomically; do not synthesize criteria or rewrite a plan.`,
  });
}

function readLedgerRows(runDirectory, contract) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  let text;
  try {
    text = readFileSync(ledgerPath, 'utf8');
  } catch (error) {
    return {
      events: null,
      finding: makeFinding({
        invariant: RUN_DOCTOR_INVARIANTS.LEDGER_COMPLETE,
        severity: 'error',
        contract,
        criterionIds: contract.criteria.map(entry => entry.id),
        responsibleFile: ledgerPath,
        authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
        observed: `${RUN_FILES.ledger} is unreadable: ${error.message}`,
        safeNextAction: `Stop the loop and restore the matching ${RUN_FILES.ledger} for this contract, or create a new run atomically; do not infer progress from state.json.`,
      }),
    };
  }
  if (text === '') {
    return {
      events: null,
      finding: makeFinding({
        invariant: RUN_DOCTOR_INVARIANTS.LEDGER_COMPLETE,
        severity: 'error',
        contract,
        criterionIds: contract.criteria.map(entry => entry.id),
        responsibleFile: ledgerPath,
        authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
        observed: `${RUN_FILES.ledger} is empty`,
        safeNextAction: `Do not continue this partial run; restore the complete initial ledger created with ${RUN_FILES.contract}, or create a new run atomically.`,
      }),
    };
  }

  const hasFinalNewline = text.endsWith('\n');
  const lines = (hasFinalNewline ? text.slice(0, -1) : text).split('\n');
  const blankLine = lines.findIndex(line => line.trim() === '');
  if (blankLine !== -1) {
    return {
      events: null,
      finding: makeFinding({
        invariant: RUN_DOCTOR_INVARIANTS.LEDGER_COMPLETE,
        severity: 'error',
        contract,
        criterionIds: contract.criteria.map(entry => entry.id),
        responsibleFile: ledgerPath,
        authorityFiles: [ledgerPath],
        line: blankLine + 1,
        observed: `${RUN_FILES.ledger} line ${blankLine + 1} is blank or partial`,
        safeNextAction: `Stop at the last complete authoritative event before line ${blankLine + 1}; restore the matching ledger from a known-good source or start a new run, without rewriting the plan.`,
      }),
    };
  }

  const events = [];
  for (let index = 0; index < lines.length; index++) {
    try {
      events.push(JSON.parse(lines[index]));
    } catch (error) {
      return {
        events: null,
        finding: makeFinding({
          invariant: RUN_DOCTOR_INVARIANTS.LEDGER_COMPLETE,
          severity: 'error',
          contract,
          criterionIds: criterionIdsForFileFailure(contract, lines[index]),
          responsibleFile: ledgerPath,
          authorityFiles: [ledgerPath],
          line: index + 1,
          observed: `${RUN_FILES.ledger} line ${index + 1} is not complete valid JSON: ${error.message}`,
          safeNextAction: `Stop at the last complete authoritative event before line ${index + 1}; restore the matching ledger from a known-good source or create a new run atomically.`,
        }),
      };
    }
  }

  if (!hasFinalNewline) {
    const last = events.at(-1);
    const criterionId = eventCriterionId(last);
    return {
      events: null,
      finding: makeFinding({
        invariant: RUN_DOCTOR_INVARIANTS.LEDGER_COMPLETE,
        severity: 'error',
        contract,
        criterionId,
        criterionIds: criterionId ? [] : contract.criteria.map(entry => entry.id),
        responsibleFile: ledgerPath,
        authorityFiles: [ledgerPath],
        line: lines.length,
        eventSequence: last?.sequence || null,
        eventType: last?.type || null,
        observed: `${RUN_FILES.ledger} has a truncated final event because its final newline is missing`,
        safeNextAction: `Stop at the last known complete ledger checkpoint before line ${lines.length}; restore the matching authoritative ledger or create a new run atomically.`,
      }),
    };
  }
  return { events: Object.freeze(events), finding: null };
}

function missingOpenedCriteria(contract, events) {
  const opened = new Set(events
    .filter(entry => entry?.type === RUN_EVENT_TYPES.CRITERION_OPENED)
    .map(entry => entry?.payload?.criterionId));
  return contract.criteria
    .map(entry => entry.id)
    .filter(criterionId => !opened.has(criterionId));
}

function previousCriterionCompletion(events, index, criterionId) {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const candidate = events[cursor];
    if (candidate?.type === RUN_EVENT_TYPES.CRITERION_COMPLETED
      && candidate?.payload?.criterionId === criterionId) {
      return candidate;
    }
  }
  return null;
}

function reducerFailure({
  runDirectory,
  contract,
  events,
  index,
  error,
  previousState,
}) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const current = events[index];
  const criterionId = eventCriterionId(current);
  const priorCriterion = previousState?.criteria?.find(
    entry => entry.id === criterionId,
  );
  const priorCompletion = current?.type === RUN_EVENT_TYPES.CRITERION_COMPLETED
    ? previousCriterionCompletion(events, index, criterionId)
    : null;

  if (INCOMPLETE_INITIALIZATION.test(error.message)) {
    const missing = missingOpenedCriteria(contract, events);
    return makeFinding({
      invariant: RUN_DOCTOR_INVARIANTS.LEDGER_INITIALIZATION_COMPLETE,
      severity: 'error',
      contract,
      criterionId: missing[0] || criterionId,
      criterionIds: missing,
      responsibleFile: ledgerPath,
      authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
      eventSequence: current?.sequence || null,
      eventType: current?.type || null,
      line: index + 1,
      observed: `Ledger initialization is incomplete; criterion.opened is missing for ${missing.join(', ') || 'a declared criterion'}.`,
      safeNextAction: `Do not continue the partial authority; restore the complete contract-created ledger containing criterion.opened for ${missing.join(', ')}, or create a new run atomically.`,
    });
  }

  if (priorCompletion && priorCriterion?.status === 'complete') {
    return makeFinding({
      invariant: RUN_DOCTOR_INVARIANTS.CRITERION_COMPLETION_NONCONFLICTING,
      severity: 'error',
      contract,
      criterionId,
      responsibleFile: ledgerPath,
      authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
      eventSequence: current.sequence,
      eventType: current.type,
      line: index + 1,
      receiptId: eventReceiptId(current),
      priorEventSequence: priorCompletion.sequence,
      priorReceiptId: priorCompletion.payload.receiptId,
      observed: `Conflicting criterion.completed at sequence ${current.sequence} references receipt ${eventReceiptId(current)} while criterion ${criterionId} is already complete from sequence ${priorCompletion.sequence} receipt ${priorCompletion.payload.receiptId}; no criterion.reopened intervened.`,
      safeNextAction: `Stop appending after the last valid sequence ${previousState.lastSequence}; preserve both files and reconcile them against the original authoritative copy, or start a new run. Do not choose a completion or rewrite ledger rows automatically.`,
    });
  }

  const duplicateIdentity = /duplicate (attempt|evidence receipt|debt|resume token)/i.exec(
    error.message,
  );
  if (duplicateIdentity) {
    return makeFinding({
      invariant: RUN_DOCTOR_INVARIANTS.LEDGER_EVENT_IDENTITY_UNIQUE,
      severity: 'error',
      contract,
      criterionId,
      criterionIds: criterionId ? [] : contract.criteria.map(entry => entry.id),
      responsibleFile: ledgerPath,
      authorityFiles: [ledgerPath],
      eventSequence: current?.sequence || null,
      eventType: current?.type || null,
      line: index + 1,
      receiptId: eventReceiptId(current),
      observed: error.message,
      safeNextAction: `Stop appending after the last valid sequence ${previousState?.lastSequence || 0}; preserve the conflicting event and compare it with the authoritative source. Resume only from a unique, valid ledger or a new run.`,
    });
  }

  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.LEDGER_TRANSITION_LEGAL,
    severity: 'error',
    contract,
    criterionId,
    criterionIds: criterionId ? [] : contract.criteria.map(entry => entry.id),
    responsibleFile: ledgerPath,
    authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
    eventSequence: current?.sequence || null,
    eventType: current?.type || null,
    line: index + 1,
    priorCriterionStatus: priorCriterion?.status || null,
    observed: error.message,
    safeNextAction: `Stop appending after the last valid sequence ${previousState?.lastSequence || 0}; preserve the invalid ${current?.type || 'ledger'} event and restore a matching authoritative ledger or start a new run. Do not rewrite the plan or guess a replacement transition.`,
  });
}

function localizeLedgerFailure(runDirectory, contract, events) {
  let previousState = null;
  for (let index = 0; index < events.length; index++) {
    try {
      previousState = replayRunLedger(events.slice(0, index + 1));
    } catch (error) {
      const expectedEarlyIncomplete = INCOMPLETE_INITIALIZATION.test(error.message)
        && index < events.length - 1;
      if (expectedEarlyIncomplete) continue;
      return {
        state: previousState,
        finding: reducerFailure({
          runDirectory,
          contract,
          events,
          index,
          error,
          previousState,
        }),
      };
    }
  }
  return { state: previousState, finding: null };
}

function contractLedgerBindingFinding(runDirectory, contract, events) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const created = events[0];
  const expectedCriteria = contract.criteria.map(entry => entry.id);
  const expectedBlockers = contract.blockers.map(entry => entry.id);
  const actualCriteria = created?.payload?.criterionIds || [];
  const actualBlockers = created?.payload?.blockerIds || [];
  const contractHasPlan = hasOwn(contract, 'planHash');
  const ledgerHasPlan = hasOwn(created?.payload || {}, 'planHash');
  const differences = [];
  if (created?.payload?.contractSchemaVersion !== contract.schemaVersion) {
    differences.push(
      `schema ${created?.payload?.contractSchemaVersion} != ${contract.schemaVersion}`,
    );
  }
  if (created?.payload?.runId !== contract.runId) {
    differences.push(`runId ${created?.payload?.runId} != ${contract.runId}`);
  }
  if (JSON.stringify(actualCriteria) !== JSON.stringify(expectedCriteria)) {
    differences.push(
      `criteria ${JSON.stringify(actualCriteria)} != ${JSON.stringify(expectedCriteria)}`,
    );
  }
  if (JSON.stringify(actualBlockers) !== JSON.stringify(expectedBlockers)) {
    differences.push(
      `blockers ${JSON.stringify(actualBlockers)} != ${JSON.stringify(expectedBlockers)}`,
    );
  }
  if (contractHasPlan !== ledgerHasPlan
    || (contractHasPlan && (
      created.payload.planPath !== contract.planPath
      || created.payload.planHash !== contract.planHash
    ))) {
    differences.push('plan binding differs between contract.json and contract.created');
  }
  if (differences.length === 0) return null;

  const differingCriteria = freezeStrings([
    ...expectedCriteria.filter(entry => !actualCriteria.includes(entry)),
    ...actualCriteria.filter(entry => !expectedCriteria.includes(entry)),
  ]);
  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.CONTRACT_LEDGER_BINDING,
    severity: 'error',
    contract,
    criterionId: differingCriteria[0] || expectedCriteria[0],
    criterionIds: differingCriteria.length > 0 ? differingCriteria : expectedCriteria,
    responsibleFile: ledgerPath,
    authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
    eventSequence: created?.sequence || 1,
    eventType: created?.type || null,
    line: 1,
    observed: `contract.json conflicts with ledger.jsonl line 1 for criteria ${expectedCriteria.join(', ')}: ${differences.join('; ')}`,
    safeNextAction: 'Stop the loop and restore contract.json plus ledger.jsonl from the same atomic run creation, or create a new run; do not merge or rewrite one side to match the other.',
  });
}

function stateDerivationFailure(runDirectory, contract, error, events) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const planFailure = hasOwn(contract, 'planPath')
    && PLAN_DERIVATION_FAILURE.test(error.message);
  const criterionMatches = contract.criteria
    .map(entry => entry.id)
    .filter(criterionId => error.message.includes(criterionId));
  const receiptMatch = /evidence receipt "([^"]+)"/.exec(error.message);
  const latestEvent = events.at(-1);
  return makeFinding({
    invariant: planFailure
      ? RUN_DOCTOR_INVARIANTS.PLAN_BINDING_EXPLICIT
      : RUN_DOCTOR_INVARIANTS.AUTHORITATIVE_STATE_DERIVABLE,
    severity: 'error',
    contract,
    criterionId: criterionMatches[0] || eventCriterionId(latestEvent),
    criterionIds: criterionMatches.length > 0
      ? criterionMatches
      : contract.criteria.map(entry => entry.id),
    responsibleFile: planFailure && contract.planPath
      ? contract.planPath
      : ledgerPath,
    authorityFiles: [
      path.join(runDirectory, RUN_FILES.contract),
      ledgerPath,
      ...(contract.planPath ? [contract.planPath] : []),
    ],
    receiptId: receiptMatch?.[1] || null,
    observed: error.message,
    safeNextAction: planFailure
      ? 'Stop the loop and record an explicit plan.rebound or plan.deviation.recorded through the authorized steering path only after human review; the doctor will not rewrite the plan.'
      : 'Stop the loop and preserve the contract/ledger pair for inspection; resume only after the named binding is restored from authoritative evidence or in a new run.',
  });
}

function staleReceiptFinding(runDirectory, contract, state, criterionState) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const receipt = state.receipts.find(
    entry => entry.id === criterionState.completionReceiptId,
  );
  const check = receipt
    ? contract.checks.find(entry => entry.id === receipt.check.id)
    : contract.checks.find(entry => entry.criterionId === criterionState.id);
  const targetFiles = receipt
    ? receipt.target.paths.map(entry => path.resolve(
      receipt.target.root,
      ...entry.split('/'),
    ))
    : [];
  const artifactFile = receipt
    ? path.resolve(runDirectory, ...receipt.artifact.path.split('/'))
    : null;
  const responsibleFile = criterionState.staleReason?.startsWith('artifact_')
    ? artifactFile
    : targetFiles[0] || ledgerPath;
  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.COMPLETION_RECEIPT_CURRENT,
    severity: 'blocked',
    contract,
    criterionId: criterionState.id,
    responsibleFile,
    authorityFiles: [ledgerPath, ...targetFiles, artifactFile],
    receiptId: receipt?.id || criterionState.completionReceiptId,
    checkId: check?.id || receipt?.check?.id || null,
    checkDefinition: check?.definition || receipt?.check?.definition || null,
    staleReason: criterionState.staleReason,
    targetPaths: Object.freeze(targetFiles),
    artifactPath: artifactFile,
    relatedLoopState: VERIFIED_LOOP_STATES.RESUME_REFUSED,
    observed: `Criterion ${criterionState.id} is freshness-open because completion receipt ${criterionState.completionReceiptId} is stale: ${criterionState.staleReason}.`,
    safeNextAction: `Append criterion.reopened for ${criterionState.id} through the authorized run-state path before a new attempt, then rerun ${check?.id || 'the bound contract check'} and record a fresh current-attempt PASS receipt; do not reuse ${criterionState.completionReceiptId}.`,
  });
}

function currentAttemptFinding(runDirectory, contract, state, criterionState) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const checks = contract.checks.filter(
    entry => entry.criterionId === criterionState.id,
  );
  const currentReceipts = state.receipts.filter(
    entry => entry.criterionId === criterionState.id
      && entry.attemptId === criterionState.currentAttemptId,
  );
  const latest = currentReceipts.at(-1);
  const check = latest
    ? contract.checks.find(entry => entry.id === latest.check.id)
    : checks[0];

  if (!latest) {
    return makeFinding({
      invariant: RUN_DOCTOR_INVARIANTS.CURRENT_ATTEMPT_EVIDENCE_REQUIRED,
      severity: 'blocked',
      contract,
      criterionId: criterionState.id,
      responsibleFile: ledgerPath,
      authorityFiles: [path.join(runDirectory, RUN_FILES.contract), ledgerPath],
      attemptId: criterionState.currentAttemptId,
      checkId: check?.id || null,
      checkDefinition: check?.definition || null,
      relatedLoopState: VERIFIED_LOOP_STATES.RESUME_REFUSED,
      observed: `Criterion ${criterionState.id} has current attempt ${criterionState.currentAttemptId} but no evidence receipt for that attempt.`,
      safeNextAction: `Execute the exact contract check ${check?.id || '(no check is bound)'}${check ? `: ${check.definition}` : ''}, record its receipt for attempt ${criterionState.currentAttemptId}, and do not append criterion.completed without the latest current-attempt PASS.`,
    });
  }

  if (latest.result === 'fail') {
    const artifactFile = path.resolve(
      runDirectory,
      ...latest.artifact.path.split('/'),
    );
    return makeFinding({
      invariant: RUN_DOCTOR_INVARIANTS.CURRENT_ATTEMPT_PASS_REQUIRED,
      severity: 'blocked',
      contract,
      criterionId: criterionState.id,
      responsibleFile: artifactFile,
      authorityFiles: [ledgerPath, artifactFile],
      attemptId: criterionState.currentAttemptId,
      receiptId: latest.id,
      checkId: latest.check.id,
      checkDefinition: latest.check.definition,
      artifactPath: artifactFile,
      relatedLoopState: VERIFIED_LOOP_STATES.RESUME_REFUSED,
      observed: `Criterion ${criterionState.id} remains open because its latest current-attempt receipt ${latest.id} records fail on check ${latest.check.id}.`,
      safeNextAction: latest.check.type === 'command'
        ? `Use only an explicit repair path anchored to executable FAIL receipt ${latest.id}; do not start another generation or append criterion.completed without a later current-attempt PASS.`
        : `Keep criterion ${criterionState.id} open and rerun the exact check ${latest.check.id}; record a later current-attempt PASS before completion.`,
    });
  }

  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.CRITERION_COMPLETION_EVENT_REQUIRED,
    severity: 'blocked',
    contract,
    criterionId: criterionState.id,
    responsibleFile: ledgerPath,
    authorityFiles: [ledgerPath],
    attemptId: criterionState.currentAttemptId,
    receiptId: latest.id,
    checkId: latest.check.id,
    checkDefinition: latest.check.definition,
    relatedLoopState: VERIFIED_LOOP_STATES.RESUME_REFUSED,
    observed: `Criterion ${criterionState.id} has current latest PASS receipt ${latest.id}, but no criterion.completed event records that completion.`,
    safeNextAction: `Append one criterion.completed event for ${criterionState.id} referencing latest receipt ${latest.id} through the authorized run-state API; do not rerun generation or choose a different receipt.`,
  });
}

function recoveryFinding(runDirectory, contract, criterionState) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.VERIFIED_LOOP_RECOVERY_REQUIRED,
    severity: 'blocked',
    contract,
    criterionId: criterionState.id,
    responsibleFile: ledgerPath,
    authorityFiles: [ledgerPath],
    attemptId: criterionState.attemptIds.at(-1) || null,
    relatedLoopState: VERIFIED_LOOP_STATES.RESUME_REFUSED,
    observed: `Criterion ${criterionState.id} is open with prior attempt history ${criterionState.attemptIds.join(', ')} and no current attempt; G3.5 refuses to reset its one-generation cap.`,
    safeNextAction: `Use an explicit recovery path that preserves the attempt history for ${criterionState.id}; do not start a fresh generation, rewrite the plan, or infer completion.`,
  });
}

function haltFinding(runDirectory, contract, state) {
  const ledgerPath = path.join(runDirectory, RUN_FILES.ledger);
  const debt = state.debt.open[0] || null;
  const criterionId = debt?.criterionId || state.openCriteria[0]
    || contract.criteria[0]?.id;
  return makeFinding({
    invariant: RUN_DOCTOR_INVARIANTS.RUN_HALT_TERMINAL,
    severity: 'blocked',
    contract,
    criterionId,
    responsibleFile: ledgerPath,
    authorityFiles: [ledgerPath],
    eventSequence: state.haltSequence,
    eventType: RUN_EVENT_TYPES.RUN_HALTED,
    debtId: debt?.id || null,
    haltReason: state.haltReason,
    relatedLoopState: VERIFIED_LOOP_STATES.HALTED,
    observed: `Run is terminally halted at sequence ${state.haltSequence}: ${state.haltReason}${debt ? `; open debt ${debt.id} is bound to ${debt.criterionId || 'the run'}` : ''}.`,
    safeNextAction: 'Do not append or auto-resume this halted ledger. Preserve it for human review; any continuation requires a separately authorized new run after the named halt/debt is addressed.',
  });
}

function validStateFindings(runDirectory, contract, state) {
  const findings = [];
  for (const criterion of state.criteria) {
    if (criterion.freshness === 'stale') {
      findings.push(staleReceiptFinding(
        runDirectory,
        contract,
        state,
        criterion,
      ));
    }
  }
  if (state.halted) {
    findings.push(haltFinding(runDirectory, contract, state));
    return findings;
  }
  const nextId = state.openCriteria[0];
  if (!nextId) return findings;
  const criterion = state.criteria.find(entry => entry.id === nextId);
  if (criterion.freshness === 'stale') return findings;
  if (criterion.currentAttemptId) {
    findings.push(currentAttemptFinding(
      runDirectory,
      contract,
      state,
      criterion,
    ));
  } else if (criterion.attemptIds.length > 0) {
    findings.push(recoveryFinding(runDirectory, contract, criterion));
  }
  return findings;
}

/**
 * Diagnose one run directory without modifying it.
 *
 * Invalid ledgers are localized with raw read-only JSONL parsing followed by
 * authoritative replay of successive prefixes. Valid ledgers are loaded
 * through loadRunState() so receipt freshness and plan binding use the same
 * authority as the verified loop.
 */
export function diagnoseActiveRun(runDirectory) {
  const root = path.resolve(nonEmptyString(runDirectory, 'runDirectory'));
  let contract;
  try {
    contract = readRunContract(root);
  } catch (error) {
    return buildReport(root, null, null, [contractFailure(root, error)]);
  }

  const ledger = readLedgerRows(root, contract);
  if (ledger.finding) {
    return buildReport(root, contract, null, [ledger.finding]);
  }

  const created = ledger.events[0];
  const comparableCreated = created?.type === RUN_EVENT_TYPES.CONTRACT_CREATED
    && created.payload
    && typeof created.payload === 'object'
    && Array.isArray(created.payload.criterionIds)
    && Array.isArray(created.payload.blockerIds);
  if (comparableCreated) {
    const earlyBindingFinding = contractLedgerBindingFinding(
      root,
      contract,
      ledger.events,
    );
    if (earlyBindingFinding) {
      return buildReport(root, contract, null, [earlyBindingFinding]);
    }
  }

  const localized = localizeLedgerFailure(root, contract, ledger.events);
  if (localized.finding) {
    return buildReport(root, contract, localized.state, [localized.finding]);
  }

  const bindingFinding = contractLedgerBindingFinding(
    root,
    contract,
    ledger.events,
  );
  if (bindingFinding) {
    return buildReport(root, contract, localized.state, [bindingFinding]);
  }

  let state;
  try {
    state = loadRunState(root);
  } catch (error) {
    return buildReport(root, contract, localized.state, [
      stateDerivationFailure(root, contract, error, ledger.events),
    ]);
  }
  return buildReport(root, contract, state, validStateFindings(
    root,
    contract,
    state,
  ));
}
