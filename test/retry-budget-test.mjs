// G2.1 deterministic retry/iteration budget oracle.
// Every consumable budget is tested in both directions: within-cap proceeds, cap+1 halts and surfaces.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  BUDGET_CONFIG_ENV,
  DEFAULT_BUDGETS,
  createBudgetTracker,
  loadBudgetConfig,
  parseBudgetConfig,
} from '../orchestration/lib/budget.mjs';

let ok = 0;
let n = 0;
const t = (condition, message) => {
  n++;
  if (condition) {
    ok++;
    console.log('PASS:', message);
  } else {
    console.log('FAIL:', message);
  }
};
const captureWarnings = () => {
  const warnings = [];
  return { warnings, warn: (message) => warnings.push(String(message)) };
};

// Proven/default boundaries.
t(DEFAULT_BUDGETS.genRoundCap === 1, 'defaults pin the proven generation-round cap at 1');
t(
  DEFAULT_BUDGETS.verifiedLoopCap === 2 && DEFAULT_BUDGETS.verifiedLoopHardMax === 3,
  'defaults encode verified-loop cap 2 and hard max 3',
);
t(DEFAULT_BUDGETS.retryCap === 3, 'defaults follow the existing bounded 3-retry engineering precedent');

const clampCapture = captureWarnings();
const clamped = parseBudgetConfig({
  retryCap: 99,
  genRoundCap: 8,
  verifiedLoopCap: 12,
  verifiedLoopHardMax: 20,
}, { warn: clampCapture.warn, sourceLabel: 'seeded clamp config' });
t(
  clamped.retryCap === 3
    && clamped.genRoundCap === 1
    && clamped.verifiedLoopCap === 3
    && clamped.verifiedLoopHardMax === 3,
  'oversized numeric config is clamped to safe retry/verified limits and immutable proven caps',
);
t(
  clampCapture.warnings.some((warning) => /genRoundCap=8/.test(warning) && /clamped to 1/.test(warning)),
  'attempting to raise genRoundCap above 1 emits a warning and is clamped to 1',
);
t(
  clampCapture.warnings.some((warning) => /verifiedLoopHardMax=20/.test(warning) && /pinned to 3/.test(warning)),
  'attempting to raise the verified-loop hard max emits a warning and remains pinned to 3',
);

// Optional config sources: inline environment JSON and a JSON file.
const envConfig = loadBudgetConfig({
  env: { [BUDGET_CONFIG_ENV]: JSON.stringify({ retryCap: 1, verifiedLoopCap: 3 }) },
  warn: () => {},
});
t(
  envConfig.retryCap === 1 && envConfig.genRoundCap === 1 && envConfig.verifiedLoopCap === 3,
  'optional inline environment JSON loads without changing omitted proven defaults',
);

const root = mkdtempSync(path.join(tmpdir(), 'fable-retry-budget-'));
try {
  const configFile = path.join(root, 'budgets.json');
  writeFileSync(configFile, JSON.stringify({ retryCap: 3, genRoundCap: 1, verifiedLoopCap: 1 }));
  const fileConfig = loadBudgetConfig({ filePath: configFile, env: {}, warn: () => {} });
  t(
    fileConfig.retryCap === 3 && fileConfig.genRoundCap === 1 && fileConfig.verifiedLoopCap === 1,
    'optional JSON file loads a valid bounded config',
  );

  const malformedFile = path.join(root, 'malformed.json');
  writeFileSync(malformedFile, '{"retryCap":');
  const badJsonCapture = captureWarnings();
  const badJson = loadBudgetConfig({
    filePath: malformedFile,
    env: {},
    warn: badJsonCapture.warn,
  });
  t(
    assert.deepEqual(badJson, DEFAULT_BUDGETS) === undefined && badJsonCapture.warnings.length > 0,
    'malformed JSON does not crash: it returns all defaults and emits a warning',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

const badTypeCapture = captureWarnings();
const badTypes = parseBudgetConfig(
  { retryCap: '2', genRoundCap: 1, verifiedLoopCap: 2 },
  { warn: badTypeCapture.warn, sourceLabel: 'seeded bad-type config' },
);
t(
  assert.deepEqual(badTypes, DEFAULT_BUDGETS) === undefined && badTypeCapture.warnings.length > 0,
  'bad budget types do not crash or coerce: they return all defaults and emit a warning',
);

const nullCapture = captureWarnings();
const nullConfig = parseBudgetConfig(null, {
  warn: nullCapture.warn,
  sourceLabel: 'seeded null config',
});
t(
  assert.deepEqual(nullConfig, DEFAULT_BUDGETS) === undefined && nullCapture.warnings.length > 0,
  'a malformed null config source returns all defaults and emits a warning',
);

const nonJsonCapture = captureWarnings();
const nonJsonObject = parseBudgetConfig(new Date(0), {
  warn: nonJsonCapture.warn,
  sourceLabel: 'seeded Date config',
});
t(
  assert.deepEqual(nonJsonObject, DEFAULT_BUDGETS) === undefined && nonJsonCapture.warnings.length > 0,
  'a non-JSON object source returns all defaults and emits a warning',
);

let getterReads = 0;
const changingGetterConfig = {};
Object.defineProperty(changingGetterConfig, 'retryCap', {
  enumerable: true,
  get() {
    getterReads++;
    return getterReads === 1 ? 1 : Number.NaN;
  },
});
const capturedGetterConfig = parseBudgetConfig(changingGetterConfig, { warn: () => {} });
const getterTracker = createBudgetTracker(capturedGetterConfig, { warn: () => {} });
t(
  getterReads === 1
    && getterTracker.consume('retryCap').action === 'proceed'
    && getterTracker.consume('retryCap').action === 'halt-and-surface',
  'config accessors are captured once, so changing later reads cannot bypass the retry cap',
);

const throwingGetterCapture = captureWarnings();
const throwingGetterConfig = {};
Object.defineProperty(throwingGetterConfig, 'retryCap', {
  enumerable: true,
  get() {
    throw new Error('seeded getter failure');
  },
});
const throwingGetterResult = parseBudgetConfig(throwingGetterConfig, {
  warn: throwingGetterCapture.warn,
  sourceLabel: 'seeded throwing-getter config',
});
t(
  assert.deepEqual(throwingGetterResult, DEFAULT_BUDGETS) === undefined
    && throwingGetterCapture.warnings.some((warning) => /could not be read safely/.test(warning)),
  'a throwing config accessor does not crash: it returns defaults and emits a warning',
);

const unitTracker = createBudgetTracker(DEFAULT_BUDGETS, { warn: () => {} });
let multiUnitRejected = false;
try {
  unitTracker.consume('retryCap', 2);
} catch (error) {
  multiUnitRejected = error instanceof RangeError;
}
t(
  multiUnitRejected && unitTracker.snapshot().consumed.retryCap === 0,
  'multi-unit consumption is rejected before state changes, preventing a surfaced halt from being bypassed',
);

// Mandatory bidirectional oracle: every cap allows all in-budget calls, then blocks cap+1.
for (const [budget, cap] of [
  ['retryCap', DEFAULT_BUDGETS.retryCap],
  ['genRoundCap', DEFAULT_BUDGETS.genRoundCap],
  ['verifiedLoopCap', DEFAULT_BUDGETS.verifiedLoopCap],
]) {
  const tracker = createBudgetTracker(DEFAULT_BUDGETS, { warn: () => {} });
  let within;
  for (let attempt = 1; attempt <= cap; attempt++) within = tracker.consume(budget);

  t(
    within.action === 'proceed'
      && within.proceed === true
      && within.continue === true
      && within.halt === false
      && within.budget === budget
      && within.consumed === cap
      && within.remaining === 0,
    `${budget}: the within-budget boundary call proceeds`,
  );

  const over = tracker.consume(budget);
  t(
    over.action === 'halt-and-surface'
      && over.proceed === false
      && over.continue === false
      && over.halt === true
      && over.reason === 'budget-exhausted'
      && over.budget === budget
      && over.consumed === cap
      && over.attempted === cap + 1
      && over.report?.audience === 'human'
      && over.report?.budget === budget
      && /exhausted/.test(over.report?.message || ''),
    `${budget}: the first over-budget call halts and surfaces a human report naming the exhausted budget`,
  );

  const repeated = tracker.consume(budget);
  t(
    repeated.action === 'halt-and-surface'
      && repeated.consumed === cap
      && repeated.attempted === cap + 1
      && tracker.snapshot().consumed[budget] === cap,
    `${budget}: repeated over-budget calls remain halted without advancing or resetting consumption`,
  );
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
