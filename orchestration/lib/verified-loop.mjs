// Explicitly opt-in, bounded verified-completion state machine.
// Completion is decided only by an executable oracle PASS recorded as a G3.2 receipt.
// Repair is reachable only from a captured, ledger-recorded executable oracle FAIL.
// This module is inert until imported and FABLE_VERIFIED_LOOP=on is supplied.
// Zero dependencies: Node built-ins only.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  createBudgetTracker,
  loadBudgetConfig,
} from './budget.mjs';
import {
  extractPlanCriteria,
  inspectPlanArtifact,
} from './plan-artifact.mjs';
import {
  RUN_EVENT_TYPES,
  RUN_WRITE_BOUNDARIES,
  appendRunEvent,
  completeCriterion,
  computeTargetIdentity,
  createEvidenceReceipt,
  loadRunState,
  readRunContract,
  recordCriterionEvidence,
  startCriterionAttempt,
} from './run-state.mjs';

export const VERIFIED_LOOP_ENV = 'FABLE_VERIFIED_LOOP';
export const VERIFIED_LOOP_ENABLED_VALUE = 'on';
export const EXECUTABLE_ORACLE_SCHEMA_VERSION = 1;

export const VERIFIED_LOOP_STATES = Object.freeze({
  IDLE: 'idle',
  DISABLED: 'disabled',
  SELECTING: 'selecting',
  ALREADY_COMPLETE: 'already-complete',
  ORACLE_REQUIRED: 'oracle-required',
  RESUME_REFUSED: 'resume-refused',
  ACTING: 'acting',
  VERIFYING: 'verifying',
  ATOMIC_ACTING: 'atomic-acting',
  ATOMIC_VERIFYING: 'atomic-verifying',
  EVIDENCE_RECORDED: 'evidence-recorded',
  REPAIR_READY: 'repair-ready',
  REPAIRING: 'repairing',
  REPAIR_REFUSED: 'repair-refused',
  CHECKPOINTED: 'checkpointed',
  COMPLETED: 'completed',
  ATOMIC_EVIDENCE_STOP: 'atomic-evidence-stop',
  ORACLE_ERROR: 'oracle-error',
  HALTED: 'halted',
});

const TRANSITIONS = Object.freeze({
  [VERIFIED_LOOP_STATES.IDLE]: Object.freeze([
    VERIFIED_LOOP_STATES.DISABLED,
    VERIFIED_LOOP_STATES.SELECTING,
  ]),
  [VERIFIED_LOOP_STATES.SELECTING]: Object.freeze([
    VERIFIED_LOOP_STATES.ALREADY_COMPLETE,
    VERIFIED_LOOP_STATES.ORACLE_REQUIRED,
    VERIFIED_LOOP_STATES.RESUME_REFUSED,
    VERIFIED_LOOP_STATES.ACTING,
    VERIFIED_LOOP_STATES.ATOMIC_ACTING,
    VERIFIED_LOOP_STATES.HALTED,
  ]),
  [VERIFIED_LOOP_STATES.ACTING]: Object.freeze([
    VERIFIED_LOOP_STATES.VERIFYING,
  ]),
  [VERIFIED_LOOP_STATES.ATOMIC_ACTING]: Object.freeze([
    VERIFIED_LOOP_STATES.ATOMIC_VERIFYING,
  ]),
  [VERIFIED_LOOP_STATES.VERIFYING]: Object.freeze([
    VERIFIED_LOOP_STATES.EVIDENCE_RECORDED,
    VERIFIED_LOOP_STATES.ORACLE_ERROR,
  ]),
  [VERIFIED_LOOP_STATES.ATOMIC_VERIFYING]: Object.freeze([
    VERIFIED_LOOP_STATES.EVIDENCE_RECORDED,
    VERIFIED_LOOP_STATES.ORACLE_ERROR,
  ]),
  [VERIFIED_LOOP_STATES.EVIDENCE_RECORDED]: Object.freeze([
    VERIFIED_LOOP_STATES.REPAIR_READY,
    VERIFIED_LOOP_STATES.CHECKPOINTED,
  ]),
  [VERIFIED_LOOP_STATES.REPAIR_READY]: Object.freeze([
    VERIFIED_LOOP_STATES.REPAIRING,
    VERIFIED_LOOP_STATES.REPAIR_REFUSED,
    VERIFIED_LOOP_STATES.HALTED,
  ]),
  [VERIFIED_LOOP_STATES.REPAIRING]: Object.freeze([
    VERIFIED_LOOP_STATES.VERIFYING,
  ]),
  [VERIFIED_LOOP_STATES.CHECKPOINTED]: Object.freeze([
    VERIFIED_LOOP_STATES.COMPLETED,
    VERIFIED_LOOP_STATES.ATOMIC_EVIDENCE_STOP,
  ]),
});

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_ORACLE_TIMEOUT_MS = 300_000;
const ORACLE_ARTIFACT_DIRECTORY = 'artifacts/verified-loop';
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

function portableRelativePath(value, label, {
  allowDot = true,
} = {}) {
  const input = nonEmptyString(value, label);
  if (input.includes('\0')) throw new TypeError(`${label} cannot contain NUL bytes`);
  const portable = input.replaceAll('\\', '/');
  if (portable.startsWith('/') || /^[A-Za-z]:\//.test(portable)) {
    throw new TypeError(`${label} must be relative`);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError(`${label} cannot escape its root`);
  }
  if (!allowDot && normalized === '.') {
    throw new TypeError(`${label} must identify one file beneath its root`);
  }
  return normalized;
}

function normalizedStrings(value, label, {
  allowEmpty = true,
  relativePaths = false,
} = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (!allowEmpty && value.length === 0) {
    throw new TypeError(`${label} must contain at least one entry`);
  }
  const normalized = value.map((entry, index) => (
    relativePaths
      ? portableRelativePath(entry, `${label}[${index}]`)
      : nonEmptyString(entry, `${label}[${index}]`)
  ));
  if (relativePaths) normalized.sort();
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry)) {
      throw new TypeError(`${label} contains duplicate entry "${entry}"`);
    }
    seen.add(entry);
  }
  return Object.freeze(normalized);
}

function normalizedTimeout(value) {
  if (value === undefined) return 30_000;
  if (!Number.isInteger(value) || value < 1 || value > MAX_ORACLE_TIMEOUT_MS) {
    throw new TypeError(
      `oracle.timeoutMs must be an integer from 1 to ${MAX_ORACLE_TIMEOUT_MS}`,
    );
  }
  return value;
}

function regularFileIdentity(filePath, label) {
  const absolute = absolutePath(filePath, label);
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TypeError(`${label} must identify a real regular file`);
  }
  return Object.freeze({
    path: absolute,
    sha256: sha256(readFileSync(absolute)),
  });
}

function oracleDefinition(fields) {
  return `fable-executable-oracle-v${EXECUTABLE_ORACLE_SCHEMA_VERSION}:`
    + JSON.stringify({
      command: fields.command,
      commandSha256: fields.commandSha256,
      args: fields.args,
      cwd: fields.cwd,
      timeoutMs: fields.timeoutMs,
      sourceRoot: fields.sourceRoot,
      sourcePaths: fields.sourcePaths,
      sourceTreeHash: fields.sourceTreeHash,
      targetRoot: fields.targetRoot,
      targetPaths: fields.targetPaths,
    });
}

/**
 * Create the exact executable-oracle descriptor that must be copied into a
 * command check's definition before the run contract is created.
 */
export function defineExecutableOracle(input) {
  assertAllowedKeys(input, [
    'checkId',
    'command',
    'args',
    'cwd',
    'timeoutMs',
    'sourceRoot',
    'sourcePaths',
    'commandSha256',
    'sourceTreeHash',
    'targetRoot',
    'targetPaths',
    'definition',
  ], 'executable oracle');

  const commandIdentity = regularFileIdentity(input.command, 'oracle.command');
  const command = commandIdentity.path;
  const args = normalizedStrings(input.args ?? [], 'oracle.args');
  if (args.some(argument => argument.includes('\0'))) {
    throw new TypeError('oracle.args cannot contain NUL bytes');
  }
  const cwd = absolutePath(input.cwd, 'oracle.cwd');
  const sourceRoot = absolutePath(input.sourceRoot, 'oracle.sourceRoot');
  const sourcePaths = normalizedStrings(
    input.sourcePaths,
    'oracle.sourcePaths',
    { allowEmpty: false, relativePaths: true },
  );
  const sourceIdentity = computeTargetIdentity(sourceRoot, sourcePaths);
  const targetRoot = absolutePath(input.targetRoot, 'oracle.targetRoot');
  const targetPaths = normalizedStrings(
    input.targetPaths,
    'oracle.targetPaths',
    { allowEmpty: false, relativePaths: true },
  );
  const timeoutMs = normalizedTimeout(input.timeoutMs);
  const normalized = {
    checkId: identifier(input.checkId, 'oracle.checkId'),
    command,
    commandSha256: commandIdentity.sha256,
    args,
    cwd,
    timeoutMs,
    sourceRoot: sourceIdentity.root,
    sourcePaths: sourceIdentity.paths,
    sourceTreeHash: sourceIdentity.treeHash,
    targetRoot,
    targetPaths,
  };
  if (hasOwn(input, 'commandSha256')
    && input.commandSha256 !== normalized.commandSha256) {
    throw new TypeError('oracle.commandSha256 does not match the executable bytes');
  }
  if (hasOwn(input, 'sourceTreeHash')
    && input.sourceTreeHash !== normalized.sourceTreeHash) {
    throw new TypeError('oracle.sourceTreeHash does not match the executable check sources');
  }
  const definition = oracleDefinition(normalized);
  if (hasOwn(input, 'definition') && input.definition !== definition) {
    throw new TypeError('oracle.definition does not match the executable descriptor');
  }
  return Object.freeze({
    ...normalized,
    definition,
  });
}

export function isVerifiedLoopEnabled(env = process.env) {
  try {
    return env?.[VERIFIED_LOOP_ENV] === VERIFIED_LOOP_ENABLED_VALUE;
  } catch {
    return false;
  }
}

function assertAtomicFileTarget(oracle) {
  if (oracle.targetPaths.length !== 1) {
    throw new TypeError(
      'atomicSingleFile requires exactly one executable-oracle target path',
    );
  }
  const targetPath = portableRelativePath(
    oracle.targetPaths[0],
    'atomic target path',
    { allowDot: false },
  );
  const absolute = path.resolve(
    oracle.targetRoot,
    ...targetPath.split('/'),
  );
  const relative = path.relative(oracle.targetRoot, absolute);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) {
    throw new TypeError('atomic target must remain beneath oracle.targetRoot');
  }
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TypeError('atomic target must be one real regular file');
  }
  const canonicalRoot = realpathSync(oracle.targetRoot);
  const canonicalTarget = realpathSync(absolute);
  const canonicalRelative = path.relative(canonicalRoot, canonicalTarget);
  if (canonicalRelative === '' || canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(canonicalRelative)) {
    throw new TypeError('atomic target escapes the canonical target root');
  }
  return targetPath;
}

function normalizeTask(input, oracle, contract, state) {
  if (input === undefined) {
    return Object.freeze({ atomicSingleFile: false });
  }
  assertAllowedKeys(input, ['atomicSingleFile'], 'verified-loop task');
  if (typeof input.atomicSingleFile !== 'boolean') {
    throw new TypeError('verified-loop task.atomicSingleFile must be boolean');
  }
  if (input.atomicSingleFile) {
    const targetPath = assertAtomicFileTarget(oracle);
    if (contract.criteria.length !== 1 || state.openCriteria.length !== 1) {
      throw new TypeError(
        'atomicSingleFile requires exactly one contract criterion and one open criterion',
      );
    }
    if (contract.scope.include.length !== 1) {
      throw new TypeError('atomicSingleFile requires exactly one included contract file');
    }
    const includedPath = portableRelativePath(
      contract.scope.include[0],
      'atomic contract scope.include[0]',
      { allowDot: false },
    );
    if (includedPath !== targetPath) {
      throw new TypeError(
        'atomicSingleFile contract scope must name the exact executable-oracle target file',
      );
    }
  }
  return Object.freeze({ atomicSingleFile: input.atomicSingleFile });
}

function assertPlanCriteriaBinding(contract, state) {
  if (!state.plan || !hasOwn(contract, 'planPath') || !hasOwn(contract, 'planHash')) {
    throw new Error('non-atomic verified completion requires a contract-bound G3.3 plan');
  }
  const artifact = inspectPlanArtifact(contract.planPath);
  const planCriteria = extractPlanCriteria(artifact.content);
  if (planCriteria.length !== contract.criteria.length) {
    throw new Error(
      `plan criteria count ${planCriteria.length} does not match `
      + `contract criteria count ${contract.criteria.length}`,
    );
  }
  for (let index = 0; index < contract.criteria.length; index++) {
    const contractCriterion = contract.criteria[index];
    const planCriterion = planCriteria[index];
    if (planCriterion.id !== null && planCriterion.id !== contractCriterion.id) {
      throw new Error(
        `plan criterion ${index + 1} binds "${planCriterion.id}", `
        + `not contract criterion "${contractCriterion.id}"`,
      );
    }
    if (planCriterion.description !== contractCriterion.description) {
      throw new Error(
        `plan criterion ${index + 1} description does not match `
        + `contract criterion "${contractCriterion.id}"`,
      );
    }
  }
}

function normalizeNow(now) {
  if (now === undefined) return () => new Date().toISOString();
  if (typeof now !== 'function') throw new TypeError('verified-loop now must be a function');
  return () => {
    const value = nonEmptyString(now(), 'verified-loop timestamp');
    if (!Number.isFinite(Date.parse(value))) {
      throw new TypeError('verified-loop timestamp must be ISO-8601');
    }
    return value;
  };
}

class StateMachine {
  constructor() {
    this.current = VERIFIED_LOOP_STATES.IDLE;
    this.history = [this.current];
  }

  move(next) {
    const allowed = TRANSITIONS[this.current] || [];
    if (!allowed.includes(next)) {
      throw new Error(`illegal verified-loop transition ${this.current} -> ${next}`);
    }
    this.current = next;
    this.history.push(next);
  }

  snapshot() {
    return Object.freeze({
      state: this.current,
      history: Object.freeze([...this.history]),
    });
  }
}

function result(machine, status, fields = {}) {
  return Object.freeze({
    enabled: machine.current !== VERIFIED_LOOP_STATES.DISABLED,
    status,
    ...machine.snapshot(),
    ...fields,
  });
}

function oracleCheck(contract, criterionId, oracle) {
  const check = contract.checks.find(entry => entry.id === oracle.checkId);
  if (!check) {
    throw new Error(`executable oracle references unknown contract check "${oracle.checkId}"`);
  }
  if (check.criterionId !== criterionId) {
    throw new Error(
      `contract check "${check.id}" belongs to criterion "${check.criterionId}", `
      + `not selected criterion "${criterionId}"`,
    );
  }
  if (check.type !== 'command') {
    throw new Error(
      `verified completion requires an executable command check; "${check.id}" is ${check.type}`,
    );
  }
  if (check.definition !== oracle.definition) {
    throw new Error(
      `contract check "${check.id}" is not bound to the supplied executable oracle`,
    );
  }
  return check;
}

function ensureArtifactDirectory(runDirectory) {
  const runRoot = path.resolve(runDirectory);
  const directory = path.join(runRoot, ...ORACLE_ARTIFACT_DIRECTORY.split('/'));
  if (existsSync(directory)) {
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new TypeError('verified-loop artifact directory must be a real directory');
    }
  } else {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return directory;
}

function writeOracleArtifact(runDirectory, artifactId, artifact) {
  const directory = ensureArtifactDirectory(runDirectory);
  const fileName = `${artifactId}.json`;
  const absolute = path.join(directory, fileName);
  writeFileSync(absolute, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  return `${ORACLE_ARTIFACT_DIRECTORY}/${fileName}`;
}

function serializedSpawnError(error) {
  if (!error) return null;
  return Object.freeze({
    name: typeof error.name === 'string' ? error.name : 'Error',
    code: typeof error.code === 'string' ? error.code : null,
    message: typeof error.message === 'string' ? error.message : String(error),
  });
}

function classifyOracleExecution(execution) {
  if (!execution.error && !execution.signal && execution.status === 0) return 'pass';
  if (!execution.error
    && !execution.signal
    && Number.isInteger(execution.status)
    && execution.status !== 0) {
    return 'fail';
  }
  return 'error';
}

function assertExecutableOracleIdentity(oracle) {
  const commandIdentity = regularFileIdentity(oracle.command, 'oracle.command');
  if (commandIdentity.sha256 !== oracle.commandSha256) {
    throw new Error('executable oracle command bytes changed after contract binding');
  }
  const sourceIdentity = computeTargetIdentity(
    oracle.sourceRoot,
    oracle.sourcePaths,
  );
  if (sourceIdentity.treeHash !== oracle.sourceTreeHash) {
    throw new Error('executable oracle source bytes changed after contract binding');
  }
}

function executeOracle({
  runDirectory,
  criterion,
  attemptId,
  check,
  oracle,
  now,
}) {
  const artifactId = `oracle-${randomUUID()}`;
  const receiptId = `receipt-${randomUUID()}`;
  const startedAt = now();
  let execution;
  let identityVerified = false;
  try {
    assertExecutableOracleIdentity(oracle);
    identityVerified = true;
    execution = spawnSync(oracle.command, oracle.args, {
      cwd: oracle.cwd,
      encoding: 'utf8',
      timeout: oracle.timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    execution = {
      error,
      signal: null,
      status: null,
      stdout: '',
      stderr: '',
    };
  }
  const finishedAt = now();
  const outcome = classifyOracleExecution(execution);
  const artifact = Object.freeze({
    schemaVersion: EXECUTABLE_ORACLE_SCHEMA_VERSION,
    kind: 'executable-oracle',
    artifactId,
    receiptId,
    criterionId: criterion.id,
    attemptId,
    checkId: check.id,
    checkDefinition: check.definition,
    command: oracle.command,
    commandSha256: oracle.commandSha256,
    args: oracle.args,
    cwd: oracle.cwd,
    timeoutMs: oracle.timeoutMs,
    sourceRoot: oracle.sourceRoot,
    sourcePaths: oracle.sourcePaths,
    sourceTreeHash: oracle.sourceTreeHash,
    identityVerified,
    startedAt,
    finishedAt,
    outcome,
    status: Number.isInteger(execution.status) ? execution.status : null,
    signal: execution.signal || null,
    error: serializedSpawnError(execution.error),
    stdout: typeof execution.stdout === 'string' ? execution.stdout : '',
    stderr: typeof execution.stderr === 'string' ? execution.stderr : '',
  });
  const artifactPath = writeOracleArtifact(runDirectory, artifactId, artifact);

  if (outcome === 'error') {
    return Object.freeze({
      outcome,
      artifact,
      artifactPath,
      receipt: null,
    });
  }

  const recordedAt = now();
  const receipt = createEvidenceReceipt(runDirectory, {
    id: receiptId,
    criterionId: criterion.id,
    attemptId,
    check: {
      id: check.id,
      type: check.type,
      definition: check.definition,
    },
    result: outcome,
    recordedAt,
    targetRoot: oracle.targetRoot,
    targetPaths: oracle.targetPaths,
    artifactPath,
  });
  recordCriterionEvidence(runDirectory, receipt, { timestamp: now() });
  return Object.freeze({
    outcome,
    artifact,
    artifactPath,
    receipt,
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function containedArtifactPath(runDirectory, relativePath) {
  const runRoot = path.resolve(runDirectory);
  const absolute = path.resolve(runRoot, ...relativePath.split('/'));
  const relative = path.relative(runRoot, absolute);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) {
    throw new Error('repair anchor artifact escapes the run directory');
  }
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('repair anchor artifact must be a regular file');
  }
  const canonicalRoot = realpathSync(runRoot);
  const canonicalArtifact = realpathSync(absolute);
  const canonicalRelative = path.relative(canonicalRoot, canonicalArtifact);
  if (canonicalRelative === '' || canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(canonicalRelative)) {
    throw new Error('repair anchor artifact escapes the canonical run directory');
  }
  return absolute;
}

function parseArtifact(bytes, receiptId) {
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`repair anchor "${receiptId}" artifact is not valid JSON: ${error.message}`);
  }
  assertPlainRecord(artifact, `repair anchor "${receiptId}" artifact`);
  return artifact;
}

/**
 * Historical FAIL artifacts are not freshness-projected by G3.2, so the state
 * machine revalidates the exact ledger receipt, digest, and clean nonzero exit
 * immediately before every repair callback.
 */
function executableFailAnchor(runDirectory, criterionId, receiptId) {
  const state = loadRunState(runDirectory);
  const criterion = state.criteria.find(entry => entry.id === criterionId);
  if (!criterion || criterion.status !== 'open') {
    throw new Error(`repair requires open criterion "${criterionId}"`);
  }
  if (!receiptId) {
    throw new Error('repair refused: no captured executable FAIL receipt');
  }
  if (criterion.evidenceIds.at(-1) !== receiptId) {
    throw new Error(
      `repair refused: "${receiptId}" is not the latest evidence for "${criterionId}"`,
    );
  }
  const receipt = state.receipts.find(entry => entry.id === receiptId);
  if (!receipt
    || receipt.criterionId !== criterionId
    || receipt.attemptId !== criterion.currentAttemptId
    || receipt.result !== 'fail'
    || receipt.check.type !== 'command') {
    throw new Error('repair refused: latest evidence is not a current executable FAIL');
  }

  const absoluteArtifact = containedArtifactPath(runDirectory, receipt.artifact.path);
  const bytes = readFileSync(absoluteArtifact);
  if (sha256(bytes) !== receipt.artifact.sha256) {
    throw new Error(`repair refused: FAIL artifact digest mismatch for "${receipt.id}"`);
  }
  const artifact = parseArtifact(bytes, receipt.id);
  const valid = artifact.schemaVersion === EXECUTABLE_ORACLE_SCHEMA_VERSION
    && artifact.kind === 'executable-oracle'
    && artifact.receiptId === receipt.id
    && artifact.criterionId === receipt.criterionId
    && artifact.attemptId === receipt.attemptId
    && artifact.checkId === receipt.check.id
    && artifact.checkDefinition === receipt.check.definition
    && artifact.identityVerified === true
    && artifact.outcome === 'fail'
    && Number.isInteger(artifact.status)
    && artifact.status !== 0
    && artifact.signal === null
    && artifact.error === null;
  if (!valid) {
    throw new Error(
      `repair refused: receipt "${receipt.id}" lacks a captured clean executable FAIL artifact`,
    );
  }
  return Object.freeze({
    receipt,
    artifact: Object.freeze({ ...artifact }),
    artifactPath: receipt.artifact.path,
  });
}

function selectedCriterion(contract, state) {
  const criterionId = state.openCriteria[0];
  if (!criterionId) return null;
  const criterion = contract.criteria.find(entry => entry.id === criterionId);
  if (!criterion) {
    throw new Error(`run state selected criterion missing from contract: "${criterionId}"`);
  }
  return criterion;
}

function attemptContext(criterion, attemptId, mode, failure = null) {
  return Object.freeze({
    mode,
    criterion,
    attemptId,
    generationRound: 1,
    ...(failure ? { failure } : {}),
  });
}

function budgetSnapshot(tracker) {
  return tracker ? tracker.snapshot() : null;
}

function appendBudgetHalt({
  machine,
  runDirectory,
  criterion,
  check,
  budgetDecision,
  failure,
  now,
  tracker,
}) {
  const debtId = `verified-loop-debt-${randomUUID()}`;
  const failureSuffix = failure
    ? ` Latest executable FAIL receipt ${failure.receipt.id} is captured at `
      + `${failure.artifactPath}.`
    : ' No executable cycle was permitted by the configured cap.';
  const description = `Verified-loop budget exhausted for criterion ${criterion.id} `
    + `at ${budgetDecision.consumed}/${budgetDecision.cap} on check ${check.id}.`
    + failureSuffix;
  appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId,
      description,
      criterionId: criterion.id,
      boundary: RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    },
    { timestamp: now() },
  );
  const haltReason = `verified-loop budget exhausted for criterion ${criterion.id}`;
  appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.RUN_HALTED,
    { reason: haltReason },
    { timestamp: now() },
  );
  machine.move(VERIFIED_LOOP_STATES.HALTED);
  const checkpoint = loadRunState(runDirectory);
  const report = Object.freeze({
    ...budgetDecision.report,
    criterionId: criterion.id,
    checkId: check.id,
    debtId,
    ...(failure
      ? {
        failureReceiptId: failure.receipt.id,
        failureArtifactPath: failure.artifactPath,
      }
      : {}),
  });
  return result(machine, 'halted-cap-exhausted', {
    criterion,
    report,
    checkpoint,
    budget: budgetSnapshot(tracker),
  });
}

/**
 * Run one selected unresolved criterion to one of three checkpoints:
 * executable PASS completion, executable-error/refusal, or bounded halt.
 *
 * Callback return values are deliberately discarded. Model prose, judge
 * preferences, and critiques therefore have no completion or retry transition.
 */
export async function runVerifiedCompletionLoop(input = {}) {
  const machine = new StateMachine();
  const env = input?.env ?? process.env;
  if (!isVerifiedLoopEnabled(env)) {
    machine.move(VERIFIED_LOOP_STATES.DISABLED);
    return result(machine, 'disabled');
  }

  assertPlainRecord(input, 'verified-loop input');
  const runDirectory = absolutePath(input.runDirectory, 'verified-loop runDirectory');
  const now = normalizeNow(input.now);

  machine.move(VERIFIED_LOOP_STATES.SELECTING);
  const initialState = loadRunState(runDirectory);
  if (initialState.halted) {
    machine.move(VERIFIED_LOOP_STATES.HALTED);
    return result(machine, 'already-halted', { checkpoint: initialState });
  }
  const contract = readRunContract(runDirectory);
  const criterion = selectedCriterion(contract, initialState);
  if (!criterion) {
    machine.move(VERIFIED_LOOP_STATES.ALREADY_COMPLETE);
    return result(machine, 'already-complete', { checkpoint: initialState });
  }

  const criterionState = initialState.criteria.find(entry => entry.id === criterion.id);
  if (criterionState.attemptIds.length > 0 || criterionState.freshness === 'stale') {
    machine.move(VERIFIED_LOOP_STATES.RESUME_REFUSED);
    return result(machine, 'resume-refused', {
      criterion,
      checkpoint: initialState,
      report: Object.freeze({
        audience: 'human',
        reason: 'existing-attempt-requires-recovery',
        message: `criterion ${criterion.id} already has attempt history; `
          + 'G3.5 will not reset the one-generation cap or invent an unanchored repair',
      }),
    });
  }

  if (!input.oracle) {
    machine.move(VERIFIED_LOOP_STATES.ORACLE_REQUIRED);
    return result(machine, 'oracle-required', {
      criterion,
      checkpoint: initialState,
      report: Object.freeze({
        audience: 'human',
        reason: 'executable-oracle-required',
        message: `criterion ${criterion.id} remains open until an executable oracle passes`,
      }),
    });
  }

  const oracle = defineExecutableOracle(input.oracle);
  const check = oracleCheck(contract, criterion.id, oracle);
  const task = normalizeTask(input.task, oracle, contract, initialState);
  if (!task.atomicSingleFile) assertPlanCriteriaBinding(contract, initialState);
  if (typeof input.act !== 'function') {
    throw new TypeError('verified-loop act must be a function');
  }
  if (input.repair !== undefined && typeof input.repair !== 'function') {
    throw new TypeError('verified-loop repair must be a function when provided');
  }
  if (input.checkpoint !== undefined && typeof input.checkpoint !== 'function') {
    throw new TypeError('verified-loop checkpoint must be a function when provided');
  }

  const configuredBudgets = input.budgets === undefined
    ? loadBudgetConfig({ env, warn: input.warn })
    : input.budgets;
  const tracker = createBudgetTracker(configuredBudgets, { warn: input.warn });
  const generationDecision = tracker.consume('generation-round');
  if (!generationDecision.proceed) {
    throw new Error('generation-round cap must permit the single initial action');
  }

  if (!task.atomicSingleFile) {
    const initialLoopDecision = tracker.consume('verified-loop');
    if (!initialLoopDecision.proceed) {
      return appendBudgetHalt({
        machine,
        runDirectory,
        criterion,
        check,
        budgetDecision: initialLoopDecision,
        failure: null,
        now,
        tracker,
      });
    }
  }

  const initialAttemptId = `attempt-${randomUUID()}`;
  startCriterionAttempt(
    runDirectory,
    criterion.id,
    initialAttemptId,
    { timestamp: now() },
  );
  machine.move(
    task.atomicSingleFile
      ? VERIFIED_LOOP_STATES.ATOMIC_ACTING
      : VERIFIED_LOOP_STATES.ACTING,
  );
  await input.act(attemptContext(criterion, initialAttemptId, 'generation'));

  let attemptId = initialAttemptId;
  let failure = null;
  while (true) {
    machine.move(
      task.atomicSingleFile && failure === null
        ? VERIFIED_LOOP_STATES.ATOMIC_VERIFYING
        : VERIFIED_LOOP_STATES.VERIFYING,
    );
    if (task.atomicSingleFile) assertAtomicFileTarget(oracle);
    const verification = executeOracle({
      runDirectory,
      criterion,
      attemptId,
      check,
      oracle,
      now,
    });

    if (verification.outcome === 'error') {
      machine.move(VERIFIED_LOOP_STATES.ORACLE_ERROR);
      return result(machine, 'oracle-error', {
        criterion,
        artifact: verification.artifact,
        artifactPath: verification.artifactPath,
        checkpoint: loadRunState(runDirectory),
        budget: budgetSnapshot(tracker),
        report: Object.freeze({
          audience: 'human',
          reason: 'oracle-execution-error',
          message: `executable oracle ${check.id} did not produce a clean exit; `
            + 'no completion and no repair were authorized',
        }),
      });
    }

    machine.move(VERIFIED_LOOP_STATES.EVIDENCE_RECORDED);
    if (typeof input.checkpoint === 'function') {
      await input.checkpoint(Object.freeze({
        criterion,
        receipt: verification.receipt,
        checkpoint: loadRunState(runDirectory),
      }));
    }
    if (verification.outcome === 'pass') {
      completeCriterion(
        runDirectory,
        criterion.id,
        verification.receipt.id,
        { timestamp: now() },
      );
      machine.move(VERIFIED_LOOP_STATES.CHECKPOINTED);
      const checkpoint = loadRunState(runDirectory);
      if (task.atomicSingleFile) {
        machine.move(VERIFIED_LOOP_STATES.ATOMIC_EVIDENCE_STOP);
        return result(machine, 'atomic-evidence-stop', {
          criterion,
          receipt: verification.receipt,
          checkpoint,
          budget: budgetSnapshot(tracker),
        });
      }
      machine.move(VERIFIED_LOOP_STATES.COMPLETED);
      return result(machine, 'criterion-complete', {
        criterion,
        receipt: verification.receipt,
        checkpoint,
        budget: budgetSnapshot(tracker),
      });
    }

    if (task.atomicSingleFile) {
      machine.move(VERIFIED_LOOP_STATES.CHECKPOINTED);
      const checkpoint = loadRunState(runDirectory);
      machine.move(VERIFIED_LOOP_STATES.ATOMIC_EVIDENCE_STOP);
      return result(machine, 'atomic-evidence-failed', {
        criterion,
        receipt: verification.receipt,
        checkpoint,
        budget: budgetSnapshot(tracker),
        report: Object.freeze({
          audience: 'human',
          reason: 'atomic-evidence-failed',
          message: `atomic single-file criterion ${criterion.id} remains open after its one-shot check`,
        }),
      });
    }

    machine.move(VERIFIED_LOOP_STATES.REPAIR_READY);
    try {
      failure = executableFailAnchor(
        runDirectory,
        criterion.id,
        verification.receipt.id,
      );
    } catch (error) {
      machine.move(VERIFIED_LOOP_STATES.REPAIR_REFUSED);
      return result(machine, 'repair-refused', {
        criterion,
        checkpoint: loadRunState(runDirectory),
        budget: budgetSnapshot(tracker),
        report: Object.freeze({
          audience: 'human',
          reason: 'missing-executable-fail-anchor',
          message: error.message,
        }),
      });
    }

    if (typeof input.repair !== 'function') {
      return result(machine, 'repair-required', {
        criterion,
        failure,
        checkpoint: loadRunState(runDirectory),
        budget: budgetSnapshot(tracker),
        report: Object.freeze({
          audience: 'human',
          reason: 'repair-callback-required',
          message: `criterion ${criterion.id} has an executable FAIL receipt but no repair pass`,
        }),
      });
    }

    const loopDecision = tracker.consume('verified-loop');
    if (!loopDecision.proceed) {
      return appendBudgetHalt({
        machine,
        runDirectory,
        criterion,
        check,
        budgetDecision: loopDecision,
        failure,
        now,
        tracker,
      });
    }

    const repairAttemptId = `attempt-${randomUUID()}`;
    startCriterionAttempt(
      runDirectory,
      criterion.id,
      repairAttemptId,
      { timestamp: now() },
    );
    machine.move(VERIFIED_LOOP_STATES.REPAIRING);
    await input.repair(
      attemptContext(criterion, repairAttemptId, 'repair', failure),
    );
    attemptId = repairAttemptId;
  }
}
