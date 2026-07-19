// Deterministic, opt-in retry/iteration budgets for future harness stages.
// This module changes no shipped path by itself; callers must import it explicitly.
// Zero dependencies: Node built-ins only.
import { readFileSync } from 'node:fs';

export const DEFAULT_BUDGETS = Object.freeze({
  retryCap: 3,
  genRoundCap: 1,
  verifiedLoopCap: 2,
  verifiedLoopHardMax: 3,
});

// retryCap counts retries after the initial attempt. Its 3/max=3 boundary follows the existing
// fable-handoff engineering precedent; it is not a measured quality claim.
// genRoundCap=1 and the verified-loop 2/3 values are the ledger's proven boundaries.
export const BUDGET_RANGES = Object.freeze({
  retryCap: Object.freeze({ min: 0, max: 3 }),
  genRoundCap: Object.freeze({ min: 1, max: 1 }),
  verifiedLoopCap: Object.freeze({ min: 0, max: DEFAULT_BUDGETS.verifiedLoopHardMax }),
});

export const BUDGET_CONFIG_ENV = 'FABLE_BUDGET_CONFIG';
export const BUDGET_CONFIG_FILE_ENV = 'FABLE_BUDGET_CONFIG_FILE';

const CONFIG_KEYS = Object.freeze([
  'retryCap',
  'genRoundCap',
  'verifiedLoopCap',
  'verifiedLoopHardMax',
]);

const KIND_ALIASES = new Map([
  ['retry', 'retryCap'],
  ['retryCap', 'retryCap'],
  ['generation-round', 'genRoundCap'],
  ['generationRound', 'genRoundCap'],
  ['genRound', 'genRoundCap'],
  ['genRoundCap', 'genRoundCap'],
  ['verified-loop', 'verifiedLoopCap'],
  ['verifiedLoop', 'verifiedLoopCap'],
  ['verifiedLoopCap', 'verifiedLoopCap'],
]);

const CAP_KINDS = Object.freeze({
  retryCap: 'retry',
  genRoundCap: 'generation-round',
  verifiedLoopCap: 'verified-loop',
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const defaults = () => Object.freeze({ ...DEFAULT_BUDGETS });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const errorMessage = (error) => {
  try {
    return error && typeof error.message === 'string' ? error.message : String(error);
  } catch {
    return 'unknown error';
  }
};

function warningEmitter(warn) {
  return (message) => {
    const full = `fablever budget warning: ${message}`;
    if (typeof warn === 'function') warn(full);
    return full;
  };
}

function captureConfigRecord(value, sourceLabel, emitWarning) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      emitWarning(`${sourceLabel} must be a plain JSON object; using defaults`);
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      emitWarning(`${sourceLabel} must be a plain JSON object; using defaults`);
      return null;
    }

    const captured = {};
    for (const key of CONFIG_KEYS) {
      if (hasOwn(value, key)) captured[key] = value[key];
    }
    return captured;
  } catch (error) {
    emitWarning(`${sourceLabel} could not be read safely (${errorMessage(error)}); using defaults`);
    return null;
  }
}

/**
 * Parse an inline JSON string or plain object into a safe, immutable budget config.
 * Malformed JSON/schema falls back to all proven defaults and emits a warning.
 */
export function parseBudgetConfig(source, {
  warn = console.warn,
  sourceLabel = 'budget config',
} = {}) {
  const emitWarning = warningEmitter(warn);
  if (source === undefined) return defaults();

  let config = source;
  if (typeof source === 'string') {
    try {
      config = JSON.parse(source);
    } catch (error) {
      emitWarning(`${sourceLabel} is not valid JSON (${errorMessage(error)}); using defaults`);
      return defaults();
    }
  }

  config = captureConfigRecord(config, sourceLabel, emitWarning);
  if (!config) return defaults();

  for (const key of CONFIG_KEYS) {
    if (!hasOwn(config, key)) continue;
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      emitWarning(`${sourceLabel}.${key} must be a finite integer; using defaults`);
      return defaults();
    }
  }

  const parsed = { ...DEFAULT_BUDGETS };

  if (hasOwn(config, 'retryCap')) {
    parsed.retryCap = clamp(
      config.retryCap,
      BUDGET_RANGES.retryCap.min,
      BUDGET_RANGES.retryCap.max,
    );
    if (parsed.retryCap !== config.retryCap) {
      emitWarning(
        `${sourceLabel}.retryCap=${config.retryCap} is outside `
        + `${BUDGET_RANGES.retryCap.min}..${BUDGET_RANGES.retryCap.max}; clamped to ${parsed.retryCap}`,
      );
    }
  }

  if (hasOwn(config, 'genRoundCap') && config.genRoundCap !== DEFAULT_BUDGETS.genRoundCap) {
    emitWarning(
      `${sourceLabel}.genRoundCap=${config.genRoundCap} cannot change the proven one-round cap; `
      + `clamped to ${DEFAULT_BUDGETS.genRoundCap}`,
    );
  }
  parsed.genRoundCap = DEFAULT_BUDGETS.genRoundCap;

  if (hasOwn(config, 'verifiedLoopHardMax')
    && config.verifiedLoopHardMax !== DEFAULT_BUDGETS.verifiedLoopHardMax) {
    emitWarning(
      `${sourceLabel}.verifiedLoopHardMax=${config.verifiedLoopHardMax} cannot change the hard max; `
      + `pinned to ${DEFAULT_BUDGETS.verifiedLoopHardMax}`,
    );
  }
  parsed.verifiedLoopHardMax = DEFAULT_BUDGETS.verifiedLoopHardMax;

  if (hasOwn(config, 'verifiedLoopCap')) {
    parsed.verifiedLoopCap = clamp(
      config.verifiedLoopCap,
      BUDGET_RANGES.verifiedLoopCap.min,
      parsed.verifiedLoopHardMax,
    );
    if (parsed.verifiedLoopCap !== config.verifiedLoopCap) {
      emitWarning(
        `${sourceLabel}.verifiedLoopCap=${config.verifiedLoopCap} is outside `
        + `${BUDGET_RANGES.verifiedLoopCap.min}..${parsed.verifiedLoopHardMax}; `
        + `clamped to ${parsed.verifiedLoopCap}`,
      );
    }
  }

  return Object.freeze(parsed);
}

/**
 * Load optional budget config from a JSON file or inline environment JSON.
 * Precedence: explicit filePath > FABLE_BUDGET_CONFIG_FILE > FABLE_BUDGET_CONFIG > defaults.
 */
export function loadBudgetConfig({
  env = process.env,
  filePath,
  warn = console.warn,
} = {}) {
  const emitWarning = warningEmitter(warn);
  const configuredFile = filePath || env?.[BUDGET_CONFIG_FILE_ENV];

  if (configuredFile) {
    let text;
    try {
      text = readFileSync(configuredFile, 'utf8');
    } catch (error) {
      emitWarning(`cannot read budget config file "${configuredFile}" (${errorMessage(error)}); using defaults`);
      return defaults();
    }
    return parseBudgetConfig(text, {
      warn,
      sourceLabel: `budget config file "${configuredFile}"`,
    });
  }

  const inline = env?.[BUDGET_CONFIG_ENV];
  if (inline === undefined || inline === '') return defaults();
  return parseBudgetConfig(inline, {
    warn,
    sourceLabel: BUDGET_CONFIG_ENV,
  });
}

function resolveBudgetKind(kind) {
  const capKey = KIND_ALIASES.get(kind);
  if (!capKey) {
    throw new RangeError(
      `unknown budget kind "${kind}" (expected retry, generation-round, or verified-loop)`,
    );
  }
  return capKey;
}

function proceedResult(capKey, cap, consumed) {
  return Object.freeze({
    action: 'proceed',
    status: 'proceed',
    proceed: true,
    continue: true,
    halt: false,
    budget: capKey,
    kind: CAP_KINDS[capKey],
    cap,
    consumed,
    remaining: cap - consumed,
  });
}

function haltResult(capKey, cap, consumed, attempted) {
  const report = Object.freeze({
    action: 'report-to-human',
    audience: 'human',
    reason: 'budget-exhausted',
    budget: capKey,
    kind: CAP_KINDS[capKey],
    cap,
    consumed,
    attempted,
    message: `${CAP_KINDS[capKey]} budget exhausted at ${consumed}/${cap}; halt and report to a human`,
  });
  return Object.freeze({
    action: 'halt-and-surface',
    status: 'halt-and-surface',
    proceed: false,
    continue: false,
    halt: true,
    reason: 'budget-exhausted',
    budget: capKey,
    kind: CAP_KINDS[capKey],
    cap,
    consumed,
    attempted,
    remaining: 0,
    report,
    surface: report,
  });
}

export class BudgetTracker {
  #consumed;

  constructor(budgets = DEFAULT_BUDGETS, { warn = console.warn } = {}) {
    this.budgets = parseBudgetConfig(budgets, {
      warn,
      sourceLabel: 'budget tracker config',
    });
    this.#consumed = {
      retryCap: 0,
      genRoundCap: 0,
      verifiedLoopCap: 0,
    };
    Object.freeze(this);
  }

  /**
   * Consume exactly one unit. Calls up to and including the cap proceed;
   * the first call that would exceed it halts and returns a surfaced human report.
   */
  consume(kind, units = 1) {
    if (units !== 1) {
      throw new RangeError('budget consumption is one deterministic unit per call');
    }
    const capKey = resolveBudgetKind(kind);
    const cap = this.budgets[capKey];
    const consumed = this.#consumed[capKey];
    const attempted = consumed + units;

    if (attempted > cap) return haltResult(capKey, cap, consumed, attempted);

    this.#consumed[capKey] = attempted;
    return proceedResult(capKey, cap, attempted);
  }

  snapshot() {
    return Object.freeze({
      budgets: this.budgets,
      consumed: Object.freeze({ ...this.#consumed }),
    });
  }
}

export function createBudgetTracker(budgets = DEFAULT_BUDGETS, options) {
  return new BudgetTracker(budgets, options);
}
