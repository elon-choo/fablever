// Explicitly opt-in, progress-aware continuation for authoritative G3.1 runs.
// Progress is reconstructed from meaningful ledger events between run.resumed
// boundaries. No prose, cache, caller counter, or raw sequence delta can reset
// the fixed two-strike no-progress protection. Zero dependencies.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadBudgetConfig } from './budget.mjs';
import {
  RUN_EVENT_TYPES,
  RUN_WRITE_BOUNDARIES,
  appendRunEvent,
  loadRunState,
  readRunContract,
  readRunLedger,
} from './run-state.mjs';

export const PROGRESS_CONTINUATION_ENV = 'FABLE_PROGRESS_CONTINUATION';
export const PROGRESS_CONTINUATION_ENABLED_VALUE = 'on';
export const NO_PROGRESS_STRIKE_LIMIT = 2;

export const CONTINUATION_STOP_REASONS = Object.freeze({
  STOP: 'stop',
  COMPLETE: 'complete',
  USER_ABORT: 'user-abort',
  ABORT: 'abort',
  CONTEXT_PRESSURE: 'context-pressure',
});

export const CONTINUATION_INVARIANTS = Object.freeze({
  LEDGER_PROGRESS_REQUIRED: 'continuation-ledger-progress-required',
  ATTEMPT_BUDGET: 'continuation-attempt-budget',
  COMPLETION_RECEIPT_CURRENT: 'completion-receipt-current',
  OPEN_CRITERION_REQUIRED: 'continuation-open-criterion-required',
});

export const CONTINUATION_PROGRESS_EVENT_TYPES = Object.freeze([
  RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
  RUN_EVENT_TYPES.CRITERION_COMPLETED,
]);

const PROGRESS_EVENT_TYPES = new Set(CONTINUATION_PROGRESS_EVENT_TYPES);
const STOP_REASONS = new Set(Object.values(CONTINUATION_STOP_REASONS));
const STUCK_DEBT_PREFIX = 'continuation-stuck-';
const BUDGET_DEBT_PREFIX = 'continuation-budget-';
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertAllowedKeys(value, allowedKeys, label) {
  assertPlainRecord(value, label);
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} has unknown field(s): ${unknown.join(', ')}`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function identifier(value, label) {
  const id = nonEmptyString(value, label);
  if (!ID_PATTERN.test(id)) {
    throw new TypeError(
      `${label} must start with an alphanumeric character and contain only `
      + 'letters, numbers, ".", "_", ":", or "-"',
    );
  }
  return id;
}

function absolutePath(value, label) {
  const input = nonEmptyString(value, label);
  if (!path.isAbsolute(input)) throw new TypeError(`${label} must be an absolute path`);
  return path.resolve(input);
}

function timestamp(value, label) {
  const text = nonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp`);
  }
  return text;
}

function normalizedReason(value) {
  const reason = value ?? CONTINUATION_STOP_REASONS.STOP;
  if (!STOP_REASONS.has(reason)) {
    throw new TypeError(
      `continuation reason "${reason}" is unknown `
      + `(expected ${[...STOP_REASONS].join(', ')})`,
    );
  }
  return reason;
}

function eventSummary(event) {
  return Object.freeze({
    sequence: event.sequence,
    type: event.type,
  });
}

function meaningfulEventsBetween(events, startSequence, endSequence) {
  return events.filter(event => (
    event.sequence > startSequence
    && event.sequence <= endSequence
    && PROGRESS_EVENT_TYPES.has(event.type)
  ));
}

function initializationBoundary(events) {
  const initialization = events.filter(event => (
    event.type === RUN_EVENT_TYPES.CONTRACT_CREATED
    || event.type === RUN_EVENT_TYPES.CRITERION_OPENED
  ));
  return initialization.at(-1)?.sequence ?? 0;
}

/**
 * Reconstruct continuation progress only from typed ledger rows.
 *
 * Each run.resumed row is a durable continuation boundary but never progress
 * itself. A bare attempt start is also excluded: creating another attempt ID is
 * not evidence that the work advanced. Only new evidence recorded on an open
 * criterion and explicit criterion completion move the run toward completion.
 * Reopen, debt, plan-steering, and audit events are bookkeeping or decisions and
 * cannot reset the no-progress protection.
 */
export function deriveContinuationProgress(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new TypeError('continuation progress requires a non-empty ledger event array');
  }
  const boundarySequence = initializationBoundary(events);
  const resumes = events.filter(event => event.type === RUN_EVENT_TYPES.RUN_RESUMED);
  const latestResume = resumes.at(-1) || null;
  const currentBoundary = latestResume?.sequence ?? boundarySequence;
  const currentMeaningful = meaningfulEventsBetween(
    events,
    currentBoundary,
    events.at(-1).sequence,
  );

  let previousNoProgressStreak = 0;
  for (let index = resumes.length - 1; index >= 0; index--) {
    const resume = resumes[index];
    const previousBoundary = index > 0
      ? resumes[index - 1].sequence
      : boundarySequence;
    const meaningful = meaningfulEventsBetween(
      events,
      previousBoundary,
      resume.payload.sourceSequence,
    );
    if (meaningful.length > 0) break;
    previousNoProgressStreak++;
  }

  const advanced = currentMeaningful.length > 0;
  return Object.freeze({
    source: 'ledger',
    advanced,
    boundarySequence: currentBoundary,
    latestSequence: events.at(-1).sequence,
    latestResumeSequence: latestResume?.sequence ?? null,
    meaningfulEvents: Object.freeze(currentMeaningful.map(eventSummary)),
    previousNoProgressStreak,
    prospectiveNoProgressStrikes: advanced
      ? 0
      : previousNoProgressStreak + 1,
    strikeLimit: NO_PROGRESS_STRIKE_LIMIT,
  });
}

export function isProgressContinuationEnabled(env = process.env) {
  try {
    return env?.[PROGRESS_CONTINUATION_ENV]
      === PROGRESS_CONTINUATION_ENABLED_VALUE;
  } catch {
    return false;
  }
}

function contractCriterion(contract, state) {
  const criterionId = state.openCriteria[0];
  if (!criterionId) return null;
  const criterion = contract.criteria.find(entry => entry.id === criterionId);
  if (!criterion) {
    throw new Error(
      `continuation selected criterion missing from contract: "${criterionId}"`,
    );
  }
  return criterion;
}

function conciseDescription(value, maxLength = 180) {
  const text = nonEmptyString(value, 'criterion description')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function resumeText(criterion) {
  return `Resume ${criterion.id}: ${conciseDescription(criterion.description)}`;
}

function stoppedResult(status, {
  checkpoint = null,
  criterion = null,
  blocker = null,
  report = null,
} = {}) {
  return Object.freeze({
    enabled: true,
    status,
    action: status === 'stuck'
      ? 'stop-auto-continuation'
      : 'stop',
    continue: false,
    autoContinue: false,
    stopCurrentContext: true,
    resume: null,
    criterion,
    blocker,
    checkpoint,
    report,
  });
}

function disabledResult() {
  return Object.freeze({
    enabled: false,
    status: 'disabled',
    action: 'stop',
    continue: false,
    autoContinue: false,
    stopCurrentContext: true,
    resume: null,
    criterion: null,
    blocker: null,
    checkpoint: null,
    report: null,
  });
}

function ownerDecision(contract, requestedId) {
  if (requestedId === null) return null;
  const blocker = contract.blockers.find(entry => entry.id === requestedId);
  if (!blocker) {
    throw new Error(
      `missingOwnerDecisionId references unknown contract blocker "${requestedId}"`,
    );
  }
  return blocker;
}

function stuckDescription(criterion, decision) {
  return `Automatic continuation stuck for criterion ${criterion.id}: invariant `
    + `${CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED} was violated by `
    + `${NO_PROGRESS_STRIKE_LIMIT} consecutive stop attempts with no meaningful `
    + 'ledger event since the prior continuation.'
    + (decision
      ? ` Missing owner decision ${decision.id}: ${decision.description}`
      : '');
}

function findStuckBlocker(state, contract) {
  const candidates = state.debt.open.filter(
    entry => entry.id.startsWith(STUCK_DEBT_PREFIX),
  );
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error('multiple open continuation stuck blockers violate unique blocker identity');
  }

  const debt = candidates[0];
  const criterion = contract.criteria.find(entry => entry.id === debt.criterionId);
  if (!criterion) {
    throw new Error(
      `continuation stuck blocker "${debt.id}" references unknown criterion `
      + `"${String(debt.criterionId)}"`,
    );
  }
  if (debt.description === stuckDescription(criterion, null)) {
    return Object.freeze({ debt, criterion, decision: null });
  }
  const decision = contract.blockers.find(
    blocker => debt.description === stuckDescription(criterion, blocker),
  );
  if (!decision) {
    throw new Error(
      `continuation stuck blocker "${debt.id}" does not match the canonical `
      + 'invariant and contract owner-decision record',
    );
  }
  return Object.freeze({ debt, criterion, decision });
}

function appendStuckBlocker({
  runDirectory,
  criterion,
  contract,
  requestedOwnerDecisionId,
  eventTimestamp,
}) {
  const decision = ownerDecision(contract, requestedOwnerDecisionId);
  const debtId = `${STUCK_DEBT_PREFIX}${randomUUID()}`;
  const description = stuckDescription(criterion, decision);
  appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId,
      criterionId: criterion.id,
      description,
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: eventTimestamp },
  );
  return Object.freeze({
    id: debtId,
    criterionId: criterion.id,
    invariant: CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED,
    description,
    missingOwnerDecision: decision,
  });
}

function appendResumeBoundary({
  runDirectory,
  criterion,
  state,
  requestedResumeToken,
  eventTimestamp,
}) {
  const continuationToken = requestedResumeToken
    ?? `continuation-${randomUUID()}`;
  const resumeEvent = appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.RUN_RESUMED,
    {
      resumeToken: continuationToken,
      criterionId: criterion.id,
      sourceSequence: state.lastSequence,
    },
    { timestamp: eventTimestamp },
  );
  return Object.freeze({
    text: resumeText(criterion),
    token: continuationToken,
    criterionId: criterion.id,
    criterionDescription: criterion.description,
    sourceSequence: resumeEvent.payload.sourceSequence,
    eventSequence: resumeEvent.sequence,
    timestamp: resumeEvent.timestamp,
  });
}

function continuationBudgetDecision(env, state) {
  const cap = loadBudgetConfig({ env }).retryCap;
  const consumed = state.resumes.length;
  const attempted = consumed + 1;
  return Object.freeze({
    proceed: attempted <= cap,
    budget: 'retryCap',
    kind: 'continuation-attempt',
    cap,
    consumed,
    attempted,
    remaining: Math.max(0, cap - consumed),
  });
}

function appendBudgetHalt({
  runDirectory,
  criterion,
  budgetDecision,
  eventTimestamp,
  progress,
}) {
  const debtId = `${BUDGET_DEBT_PREFIX}${randomUUID()}`;
  const description = `Automatic continuation budget exhausted for criterion `
    + `${criterion.id} at ${budgetDecision.consumed}/${budgetDecision.cap} `
    + 'authoritative resume boundaries.';
  appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId,
      criterionId: criterion.id,
      description,
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: eventTimestamp },
  );
  appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.RUN_HALTED,
    {
      reason: `automatic continuation budget exhausted for criterion ${criterion.id}`,
    },
    { timestamp: eventTimestamp },
  );
  const report = Object.freeze({
    audience: 'human',
    reason: 'budget-exhausted',
    invariant: CONTINUATION_INVARIANTS.ATTEMPT_BUDGET,
    budget: budgetDecision.budget,
    kind: budgetDecision.kind,
    cap: budgetDecision.cap,
    consumed: budgetDecision.consumed,
    attempted: budgetDecision.attempted,
    criterionId: criterion.id,
    debtId,
    message: `${description} The attempted resume was halted and surfaced.`,
  });
  return Object.freeze({
    enabled: true,
    status: 'halted-cap-exhausted',
    action: 'halt-and-surface',
    continue: false,
    autoContinue: false,
    stopCurrentContext: true,
    resume: null,
    criterion,
    blocker: Object.freeze({
      id: debtId,
      criterionId: criterion.id,
      invariant: CONTINUATION_INVARIANTS.ATTEMPT_BUDGET,
      description,
      missingOwnerDecision: null,
    }),
    checkpoint: loadRunState(runDirectory),
    progress,
    budget: budgetDecision,
    report,
  });
}

/**
 * Evaluate one stop attempt and mutate only the authoritative append-only ledger.
 *
 * The returned resume is the single directive a host may inject. Context
 * pressure returns the same directive as a clean-session handoff while requiring
 * the current context to stop. This module is inert unless explicitly imported,
 * called, and enabled with FABLE_PROGRESS_CONTINUATION=on.
 */
export function handleProgressAwareStop(input = {}) {
  const env = input?.env ?? process.env;
  if (!isProgressContinuationEnabled(env)) return disabledResult();

  assertAllowedKeys(input, [
    'runDirectory',
    'env',
    'reason',
    'timestamp',
    'resumeToken',
    'missingOwnerDecisionId',
  ], 'progress continuation input');
  const reason = normalizedReason(input.reason);

  if (reason === CONTINUATION_STOP_REASONS.USER_ABORT) {
    return stoppedResult('user-aborted');
  }
  if (reason === CONTINUATION_STOP_REASONS.ABORT) {
    return stoppedResult('aborted');
  }

  const runDirectory = absolutePath(
    input.runDirectory,
    'progress continuation runDirectory',
  );
  const eventTimestamp = timestamp(
    input.timestamp ?? new Date().toISOString(),
    'progress continuation timestamp',
  );
  const requestedResumeToken = hasOwn(input, 'resumeToken')
    ? identifier(input.resumeToken, 'progress continuation resumeToken')
    : null;
  const requestedOwnerDecisionId = hasOwn(input, 'missingOwnerDecisionId')
    ? identifier(
      input.missingOwnerDecisionId,
      'progress continuation missingOwnerDecisionId',
    )
    : null;

  const contract = readRunContract(runDirectory);
  const state = loadRunState(runDirectory);
  if (state.complete) {
    return stoppedResult('complete', { checkpoint: state });
  }
  if (state.halted) {
    return stoppedResult('already-halted', { checkpoint: state });
  }

  const existingStuck = findStuckBlocker(state, contract);
  if (existingStuck) {
    return stoppedResult('stuck', {
      checkpoint: state,
      criterion: existingStuck.criterion,
      blocker: Object.freeze({
        id: existingStuck.debt.id,
        criterionId: existingStuck.debt.criterionId,
        invariant: CONTINUATION_INVARIANTS.LEDGER_PROGRESS_REQUIRED,
        description: existingStuck.debt.description,
        missingOwnerDecision: existingStuck.decision,
      }),
      report: Object.freeze({
        audience: 'human',
        reason: 'continuation-stuck',
        message: existingStuck.debt.description,
      }),
    });
  }

  const criterion = contractCriterion(contract, state);
  if (!criterion) {
    return stoppedResult('blocked-no-open-criterion', {
      checkpoint: state,
      report: Object.freeze({
        audience: 'human',
        reason: CONTINUATION_INVARIANTS.OPEN_CRITERION_REQUIRED,
        message: 'The run is incomplete but has no ledger-open criterion to resume.',
      }),
    });
  }

  const criterionState = state.criteria.find(entry => entry.id === criterion.id);
  if (criterionState?.freshness === 'stale') {
    return stoppedResult('reopen-required', {
      checkpoint: state,
      criterion,
      report: Object.freeze({
        audience: 'human',
        reason: CONTINUATION_INVARIANTS.COMPLETION_RECEIPT_CURRENT,
        message: `Criterion ${criterion.id} is freshness-open; append an explicit `
          + 'criterion.reopened event before continuation.',
      }),
    });
  }

  if (requestedResumeToken !== null) {
    const existingResume = state.resumes.find(
      entry => entry.resumeToken === requestedResumeToken,
    );
    if (existingResume) {
      if (existingResume.sequence !== state.lastSequence
        || existingResume.criterionId !== criterion.id) {
        throw new Error(
          `resume token "${requestedResumeToken}" no longer identifies the `
          + 'current continuation checkpoint',
        );
      }
      return Object.freeze({
        enabled: true,
        status: 'already-resumed',
        action: 'no-op-existing-resume',
        continue: false,
        autoContinue: false,
        stopCurrentContext: true,
        resume: null,
        existingResume,
        criterion,
        blocker: null,
        checkpoint: state,
        progress: null,
        report: null,
      });
    }
  }

  const events = readRunLedger(runDirectory);
  const progress = deriveContinuationProgress(events);
  if (!progress.advanced
    && progress.prospectiveNoProgressStrikes >= NO_PROGRESS_STRIKE_LIMIT) {
    const blocker = appendStuckBlocker({
      runDirectory,
      criterion,
      contract,
      requestedOwnerDecisionId,
      eventTimestamp,
    });
    const checkpoint = loadRunState(runDirectory);
    return stoppedResult('stuck', {
      checkpoint,
      criterion,
      blocker,
      report: Object.freeze({
        audience: 'human',
        reason: 'no-progress-two-strike',
        invariant: blocker.invariant,
        criterionId: criterion.id,
        debtId: blocker.id,
        message: blocker.description,
      }),
    });
  }

  const budgetDecision = continuationBudgetDecision(env, state);
  if (!budgetDecision.proceed) {
    return appendBudgetHalt({
      runDirectory,
      criterion,
      budgetDecision,
      eventTimestamp,
      progress,
    });
  }

  const resume = appendResumeBoundary({
    runDirectory,
    criterion,
    state,
    requestedResumeToken,
    eventTimestamp,
  });
  const contextPressure = reason === CONTINUATION_STOP_REASONS.CONTEXT_PRESSURE;
  const status = progress.advanced
    ? 'resume-progress'
    : 'resume-first-no-progress';
  return Object.freeze({
    enabled: true,
    status,
    action: contextPressure
      ? 'checkpoint-and-clean-resume'
      : 'inject-resume',
    continue: true,
    autoContinue: true,
    stopCurrentContext: contextPressure,
    resume,
    criterion,
    blocker: null,
    checkpoint: loadRunState(runDirectory),
    progress,
    report: null,
  });
}
