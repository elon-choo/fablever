// Deterministic, opt-in run contract + append-only ledger authority.
// This module changes no shipped path by itself; callers must import it explicitly.
// state.json is a rebuildable cache only and is deliberately never read here.
// Zero dependencies: Node built-ins only.
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inspectPlanArtifact } from './plan-artifact.mjs';

export const RUN_CONTRACT_SCHEMA_VERSION = 1;
export const RUN_LEDGER_EVENT_SCHEMA_VERSION = 1;
export const RUN_DERIVED_STATE_SCHEMA_VERSION = 1;
export const EVIDENCE_RECEIPT_SCHEMA_VERSION = 1;

export const RUN_FILES = Object.freeze({
  contract: 'contract.json',
  ledger: 'ledger.jsonl',
  cache: 'state.json',
});

export const RUN_CHECK_TYPES = Object.freeze([
  'command',
  'assertion',
  'artifact',
  'observation',
]);

export const RUN_GOAL_STATUSES = Object.freeze([
  'planned',
  'done',
  'verified',
]);

export const RUN_WRITE_BOUNDARIES = Object.freeze({
  CRITERION_TRANSITION: 'criterion-transition',
  VERIFICATION_TRANSITION: 'verification-transition',
});

export const RUN_EVENT_TYPES = Object.freeze({
  CONTRACT_CREATED: 'contract.created',
  CRITERION_OPENED: 'criterion.opened',
  CRITERION_ATTEMPT_STARTED: 'criterion.attempt.started',
  CRITERION_DONE: 'criterion.done',
  CRITERION_EVIDENCE_RECORDED: 'criterion.evidence.recorded',
  CRITERION_COMPLETED: 'criterion.completed',
  CRITERION_REOPENED: 'criterion.reopened',
  DEBT_ADDED: 'debt.added',
  DEBT_RESOLVED: 'debt.resolved',
  PLAN_REBOUND: 'plan.rebound',
  PLAN_DEVIATION_RECORDED: 'plan.deviation.recorded',
  RUN_RESUMED: 'run.resumed',
  RUN_HALTED: 'run.halted',
});

const CONTRACT_KEYS = Object.freeze([
  'schemaVersion',
  'runId',
  'goal',
  'criteria',
  'scope',
  'allowedActions',
  'blockers',
  'checks',
  'planPath',
  'planHash',
]);
const CRITERION_KEYS = Object.freeze(['id', 'description']);
const SCOPE_KEYS = Object.freeze(['include', 'exclude']);
const BLOCKER_KEYS = Object.freeze(['id', 'description']);
const CHECK_KEYS = Object.freeze(['id', 'criterionId', 'type', 'definition']);
const EVENT_KEYS = Object.freeze([
  'schemaVersion',
  'sequence',
  'timestamp',
  'type',
  'payload',
]);
const CONTRACT_CREATED_KEYS = Object.freeze([
  'contractSchemaVersion',
  'runId',
  'criterionIds',
  'blockerIds',
  'planPath',
  'planHash',
]);
const CRITERION_ID_KEYS = Object.freeze(['criterionId']);
const ATTEMPT_KEYS = Object.freeze(['criterionId', 'attemptId']);
const CRITERION_DONE_KEYS = Object.freeze(['criterionId', 'boundary']);
const EVIDENCE_KEYS = Object.freeze(['receipt']);
const COMPLETION_KEYS = Object.freeze(['criterionId', 'receiptId']);
const REOPEN_KEYS = Object.freeze(['criterionId', 'reason']);
const DEBT_ADDED_KEYS = Object.freeze([
  'debtId',
  'description',
  'criterionId',
  'boundary',
]);
const DEBT_RESOLVED_KEYS = Object.freeze(['debtId', 'boundary']);
const VERIFICATION_DEBT_INPUT_KEYS = Object.freeze([
  'debtId',
  'description',
  'criterionId',
]);
const PLAN_REBOUND_KEYS = Object.freeze(['fromHash', 'toHash', 'reason']);
const PLAN_DEVIATION_KEYS = Object.freeze(['boundHash', 'observedHash', 'reason']);
const RESUME_KEYS = Object.freeze([
  'resumeToken',
  'criterionId',
  'sourceSequence',
]);
const HALT_KEYS = Object.freeze(['reason']);
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'id',
  'runId',
  'criterionId',
  'attemptId',
  'check',
  'result',
  'recordedAt',
  'target',
  'artifact',
]);
const RECEIPT_CHECK_KEYS = Object.freeze(['id', 'type', 'definition']);
const RECEIPT_TARGET_KEYS = Object.freeze(['root', 'paths', 'treeHash']);
const RECEIPT_ARTIFACT_KEYS = Object.freeze(['path', 'sha256']);
const RECEIPT_BUILDER_KEYS = Object.freeze([
  'id',
  'criterionId',
  'attemptId',
  'check',
  'result',
  'recordedAt',
  'targetRoot',
  'targetPaths',
  'artifactPath',
]);

const VALID_CHECK_TYPES = new Set(RUN_CHECK_TYPES);
const VALID_EVENT_TYPES = new Set(Object.values(RUN_EVENT_TYPES));
const VALID_WRITE_BOUNDARIES = new Set(Object.values(RUN_WRITE_BOUNDARIES));
const VALID_RECEIPT_RESULTS = new Set(['pass', 'fail']);
const RUN_RECEIPT_METADATA_PATHS = Object.freeze([
  RUN_FILES.contract,
  RUN_FILES.ledger,
  RUN_FILES.cache,
  '.fablever_state',
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const lexicalCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function assertPlainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertExactKeys(value, allowedKeys, label, optionalKeys = []) {
  assertPlainRecord(value, label);
  const allowed = new Set(allowedKeys);
  const optional = new Set(optionalKeys);
  const keys = Object.keys(value);
  const unknown = keys.filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} has unknown field(s): ${unknown.join(', ')}`);
  }
  const missing = allowedKeys.filter(key => !optional.has(key) && !hasOwn(value, key));
  if (missing.length) {
    throw new TypeError(`${label} is missing required field(s): ${missing.join(', ')}`);
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

function uniqueStrings(value, label, {
  allowEmpty = true,
  identifiers = false,
} = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (!allowEmpty && value.length === 0) {
    throw new TypeError(`${label} must contain at least one entry`);
  }
  const normalized = value.map((entry, index) => (
    identifiers
      ? identifier(entry, `${label}[${index}]`)
      : nonEmptyString(entry, `${label}[${index}]`)
  ));
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry)) throw new TypeError(`${label} contains duplicate entry "${entry}"`);
    seen.add(entry);
  }
  return Object.freeze(normalized);
}

function timestamp(value, label) {
  const text = nonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp`);
  }
  return text;
}

function writeBoundary(value, label, expected) {
  const boundary = nonEmptyString(value, label);
  if (!VALID_WRITE_BOUNDARIES.has(boundary)) {
    throw new TypeError(
      `${label} must be an explicit natural boundary `
      + `(${[...VALID_WRITE_BOUNDARIES].join(', ')}); per-turn writes are forbidden`,
    );
  }
  if (expected && boundary !== expected) {
    throw new TypeError(`${label} must be "${expected}"`);
  }
  return boundary;
}

function assertLiveWriteBoundary(type, payload) {
  if (type !== RUN_EVENT_TYPES.DEBT_ADDED
    && type !== RUN_EVENT_TYPES.DEBT_RESOLVED) {
    return;
  }
  assertPlainRecord(payload, `live ${type} payload`);
  if (!hasOwn(payload, 'boundary')) {
    throw new TypeError(
      `live ${type} writes require boundary `
      + `"${RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION}"; `
      + 'boundaryless debt rows are replay-only legacy data',
    );
  }
  writeBoundary(
    payload.boundary,
    `live ${type} payload.boundary`,
    RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Digest(value, label) {
  const digest = nonEmptyString(value, label);
  if (!SHA256_PATTERN.test(digest)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
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
    throw new TypeError(`${label} must identify a file beneath its root`);
  }
  return normalized;
}

function targetPaths(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length === 0) throw new TypeError(`${label} must contain at least one path`);
  const normalized = value.map((entry, index) => (
    portableRelativePath(entry, `${label}[${index}]`)
  ));
  normalized.sort(lexicalCompare);
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index] === normalized[index - 1]) {
      throw new TypeError(`${label} contains duplicate path "${normalized[index]}"`);
    }
  }
  return Object.freeze(normalized);
}

function absolutePath(value, label) {
  const input = nonEmptyString(value, label);
  if (!path.isAbsolute(input)) throw new TypeError(`${label} must be an absolute path`);
  return path.resolve(input);
}

function optionalPlanBinding(input, label) {
  const hasPath = hasOwn(input, 'planPath');
  const hasHash = hasOwn(input, 'planHash');
  if (hasPath !== hasHash) {
    throw new TypeError(`${label}.planPath and ${label}.planHash must be provided together`);
  }
  if (!hasPath) return null;
  return Object.freeze({
    planPath: absolutePath(input.planPath, `${label}.planPath`),
    planHash: sha256Digest(input.planHash, `${label}.planHash`),
  });
}

function sortedDirectoryEntries(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => lexicalCompare(left.name, right.name));
}

function collectTargetEntries(root, relative, entries) {
  const absolute = path.join(root, ...relative.split('/'));
  const metadata = lstatSync(absolute);
  if (metadata.isSymbolicLink()) {
    throw new Error(`target path contains unsupported symbolic link: ${relative}`);
  }
  if (metadata.isFile()) {
    entries.set(relative, Object.freeze({
      path: relative,
      type: 'file',
      sha256: sha256(readFileSync(absolute)),
    }));
    return;
  }
  if (metadata.isDirectory()) {
    entries.set(relative, Object.freeze({
      path: relative,
      type: 'directory',
    }));
    for (const entry of sortedDirectoryEntries(absolute)) {
      const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      collectTargetEntries(root, child, entries);
    }
    return;
  }
  throw new Error(`target path has unsupported entry type: ${relative}`);
}

/**
 * Hash the declared working-tree projection, not the whole repository.
 *
 * Conservative rule: target.paths is the check's declared dependency closure.
 * A file path covers only that file; a directory covers its full subtree.
 * Changes outside the recorded path set do not invalidate the receipt. Targeting
 * "." intentionally makes every working-tree change relevant.
 */
export function computeTargetIdentity(targetRoot, relevantPaths) {
  const root = absolutePath(targetRoot, 'target root');
  const rootMetadata = lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new TypeError('target root must be a real directory');
  }
  const paths = targetPaths(relevantPaths, 'target paths');
  const entries = new Map();
  for (const relative of paths) collectTargetEntries(root, relative, entries);
  const orderedEntries = [...entries.values()]
    .sort((left, right) => lexicalCompare(left.path, right.path));
  const treeHash = sha256(JSON.stringify({
    paths,
    entries: orderedEntries,
  }));
  return Object.freeze({
    root,
    paths,
    treeHash,
  });
}

function normalizeReceiptCheck(input, label) {
  assertExactKeys(input, RECEIPT_CHECK_KEYS, label);
  const type = nonEmptyString(input.type, `${label}.type`);
  if (!VALID_CHECK_TYPES.has(type)) {
    throw new TypeError(
      `${label}.type "${type}" is unknown (expected ${RUN_CHECK_TYPES.join(', ')})`,
    );
  }
  return Object.freeze({
    id: identifier(input.id, `${label}.id`),
    type,
    definition: nonEmptyString(input.definition, `${label}.definition`),
  });
}

/**
 * Strict receipt v1 validator. The normalized receipt is embedded in ledger.jsonl;
 * any source file used to import it is not a second state authority.
 */
export function validateEvidenceReceipt(input) {
  assertExactKeys(input, RECEIPT_KEYS, 'evidence receipt');
  if (input.schemaVersion !== EVIDENCE_RECEIPT_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported evidence receipt schemaVersion "${input.schemaVersion}" `
      + `(expected ${EVIDENCE_RECEIPT_SCHEMA_VERSION})`,
    );
  }
  const result = nonEmptyString(input.result, 'evidence receipt.result');
  if (!VALID_RECEIPT_RESULTS.has(result)) {
    throw new TypeError('evidence receipt.result must be "pass" or "fail"');
  }

  assertExactKeys(input.target, RECEIPT_TARGET_KEYS, 'evidence receipt.target');
  const target = Object.freeze({
    root: absolutePath(input.target.root, 'evidence receipt.target.root'),
    paths: targetPaths(input.target.paths, 'evidence receipt.target.paths'),
    treeHash: sha256Digest(
      input.target.treeHash,
      'evidence receipt.target.treeHash',
    ),
  });

  assertExactKeys(input.artifact, RECEIPT_ARTIFACT_KEYS, 'evidence receipt.artifact');
  const artifact = Object.freeze({
    path: portableRelativePath(
      input.artifact.path,
      'evidence receipt.artifact.path',
      { allowDot: false },
    ),
    sha256: sha256Digest(input.artifact.sha256, 'evidence receipt.artifact.sha256'),
  });

  return Object.freeze({
    schemaVersion: EVIDENCE_RECEIPT_SCHEMA_VERSION,
    id: identifier(input.id, 'evidence receipt.id'),
    runId: identifier(input.runId, 'evidence receipt.runId'),
    criterionId: identifier(input.criterionId, 'evidence receipt.criterionId'),
    attemptId: identifier(input.attemptId, 'evidence receipt.attemptId'),
    check: normalizeReceiptCheck(input.check, 'evidence receipt.check'),
    result,
    recordedAt: timestamp(input.recordedAt, 'evidence receipt.recordedAt'),
    target,
    artifact,
  });
}

function artifactIdentity(runDirectory, artifactPath) {
  const runRoot = path.resolve(runDirectory);
  const absolute = path.isAbsolute(artifactPath)
    ? path.resolve(artifactPath)
    : path.resolve(runRoot, artifactPath);
  const relative = path.relative(runRoot, absolute);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) {
    throw new TypeError('artifactPath must identify a file beneath runDirectory');
  }
  const canonicalRoot = realpathSync(runRoot);
  const canonicalArtifact = realpathSync(absolute);
  const canonicalRelative = path.relative(canonicalRoot, canonicalArtifact);
  if (canonicalRelative === '' || canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(canonicalRelative)) {
    throw new TypeError('artifactPath must remain beneath runDirectory after symlink resolution');
  }
  const portable = relative.split(path.sep).join('/');
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TypeError('artifactPath must identify a readable regular file');
  }
  return Object.freeze({
    path: portable,
    sha256: sha256(readFileSync(absolute)),
  });
}

/**
 * Build a content-addressed receipt from the current target and artifact bytes.
 */
export function createEvidenceReceipt(runDirectory, input) {
  assertExactKeys(input, RECEIPT_BUILDER_KEYS, 'evidence receipt input');
  const contract = readRunContract(runDirectory);
  const receipt = validateEvidenceReceipt({
    schemaVersion: EVIDENCE_RECEIPT_SCHEMA_VERSION,
    id: input.id,
    runId: contract.runId,
    criterionId: input.criterionId,
    attemptId: input.attemptId,
    check: input.check,
    result: input.result,
    recordedAt: input.recordedAt,
    target: computeTargetIdentity(input.targetRoot, input.targetPaths),
    artifact: artifactIdentity(runDirectory, input.artifactPath),
  });
  assertReceiptContractBinding(contract, receipt);
  assertReceiptTargetsOutsideRunMetadata(runDirectory, receipt);
  return receipt;
}

function freezeEntries(entries) {
  return Object.freeze(entries.map(entry => Object.freeze(entry)));
}

/**
 * Validate and normalize a complete v1 contract. Unknown fields and versions fail closed.
 * The returned value is an immutable, fixed-order JSON-safe snapshot.
 */
export function validateRunContract(input) {
  assertExactKeys(input, CONTRACT_KEYS, 'contract', ['planPath', 'planHash']);

  if (input.schemaVersion !== RUN_CONTRACT_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported contract.schemaVersion "${input.schemaVersion}" `
      + `(expected ${RUN_CONTRACT_SCHEMA_VERSION})`,
    );
  }

  const runId = identifier(input.runId, 'contract.runId');
  const goal = nonEmptyString(input.goal, 'contract.goal');
  const planBinding = optionalPlanBinding(input, 'contract');

  if (!Array.isArray(input.criteria)) {
    throw new TypeError('contract.criteria must be an array');
  }
  if (input.criteria.length === 0) {
    throw new TypeError('contract.criteria must contain at least one criterion');
  }
  const criterionIds = new Set();
  const criteria = input.criteria.map((entry, index) => {
    const label = `contract.criteria[${index}]`;
    assertExactKeys(entry, CRITERION_KEYS, label);
    const id = identifier(entry.id, `${label}.id`);
    if (criterionIds.has(id)) throw new TypeError(`duplicate criterion id "${id}"`);
    criterionIds.add(id);
    return {
      id,
      description: nonEmptyString(entry.description, `${label}.description`),
    };
  });

  assertExactKeys(input.scope, SCOPE_KEYS, 'contract.scope');
  const scopeInclude = uniqueStrings(input.scope.include, 'contract.scope.include');
  const scopeExclude = uniqueStrings(input.scope.exclude, 'contract.scope.exclude');
  const included = new Set(scopeInclude);
  const scopeOverlap = scopeExclude.filter(entry => included.has(entry));
  if (scopeOverlap.length) {
    throw new TypeError(
      `contract.scope cannot include and exclude the same entry: ${scopeOverlap.join(', ')}`,
    );
  }

  const allowedActions = uniqueStrings(input.allowedActions, 'contract.allowedActions');

  if (!Array.isArray(input.blockers)) {
    throw new TypeError('contract.blockers must be an array');
  }
  const blockerIds = new Set();
  const blockers = input.blockers.map((entry, index) => {
    const label = `contract.blockers[${index}]`;
    assertExactKeys(entry, BLOCKER_KEYS, label);
    const id = identifier(entry.id, `${label}.id`);
    if (blockerIds.has(id)) throw new TypeError(`duplicate blocker id "${id}"`);
    blockerIds.add(id);
    return {
      id,
      description: nonEmptyString(entry.description, `${label}.description`),
    };
  });

  if (!Array.isArray(input.checks)) {
    throw new TypeError('contract.checks must be an array');
  }
  const checkIds = new Set();
  const checks = input.checks.map((entry, index) => {
    const label = `contract.checks[${index}]`;
    assertExactKeys(entry, CHECK_KEYS, label);
    const id = identifier(entry.id, `${label}.id`);
    if (checkIds.has(id)) throw new TypeError(`duplicate check id "${id}"`);
    checkIds.add(id);
    const criterionId = identifier(entry.criterionId, `${label}.criterionId`);
    if (!criterionIds.has(criterionId)) {
      throw new TypeError(`${label}.criterionId references unknown criterion "${criterionId}"`);
    }
    const type = nonEmptyString(entry.type, `${label}.type`);
    if (!VALID_CHECK_TYPES.has(type)) {
      throw new TypeError(
        `${label}.type "${type}" is unknown (expected ${RUN_CHECK_TYPES.join(', ')})`,
      );
    }
    return {
      id,
      criterionId,
      type,
      definition: nonEmptyString(entry.definition, `${label}.definition`),
    };
  });

  return Object.freeze({
    schemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
    runId,
    goal,
    criteria: freezeEntries(criteria),
    scope: Object.freeze({
      include: scopeInclude,
      exclude: scopeExclude,
    }),
    allowedActions,
    blockers: freezeEntries(blockers),
    checks: freezeEntries(checks),
    ...(planBinding || {}),
  });
}

function normalizePayload(type, input) {
  const label = `event payload for ${type}`;

  if (type === RUN_EVENT_TYPES.CONTRACT_CREATED) {
    assertExactKeys(
      input,
      CONTRACT_CREATED_KEYS,
      label,
      ['planPath', 'planHash'],
    );
    if (input.contractSchemaVersion !== RUN_CONTRACT_SCHEMA_VERSION) {
      throw new RangeError(
        `${label}.contractSchemaVersion must be ${RUN_CONTRACT_SCHEMA_VERSION}`,
      );
    }
    const planBinding = optionalPlanBinding(input, label);
    return Object.freeze({
      contractSchemaVersion: RUN_CONTRACT_SCHEMA_VERSION,
      runId: identifier(input.runId, `${label}.runId`),
      criterionIds: uniqueStrings(input.criterionIds, `${label}.criterionIds`, {
        allowEmpty: false,
        identifiers: true,
      }),
      blockerIds: uniqueStrings(input.blockerIds, `${label}.blockerIds`, {
        identifiers: true,
      }),
      ...(planBinding || {}),
    });
  }

  if (type === RUN_EVENT_TYPES.PLAN_REBOUND) {
    assertExactKeys(input, PLAN_REBOUND_KEYS, label);
    const fromHash = sha256Digest(input.fromHash, `${label}.fromHash`);
    const toHash = sha256Digest(input.toHash, `${label}.toHash`);
    if (fromHash === toHash) {
      throw new TypeError(`${label} must change the bound plan hash`);
    }
    return Object.freeze({
      fromHash,
      toHash,
      reason: nonEmptyString(input.reason, `${label}.reason`),
    });
  }

  if (type === RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED) {
    assertExactKeys(input, PLAN_DEVIATION_KEYS, label);
    const boundHash = sha256Digest(input.boundHash, `${label}.boundHash`);
    const observedHash = sha256Digest(input.observedHash, `${label}.observedHash`);
    if (boundHash === observedHash) {
      throw new TypeError(`${label} requires an observed hash different from the binding`);
    }
    return Object.freeze({
      boundHash,
      observedHash,
      reason: nonEmptyString(input.reason, `${label}.reason`),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_OPENED) {
    assertExactKeys(input, CRITERION_ID_KEYS, label);
    return Object.freeze({
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED) {
    assertExactKeys(input, ATTEMPT_KEYS, label);
    return Object.freeze({
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
      attemptId: identifier(input.attemptId, `${label}.attemptId`),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_DONE) {
    assertExactKeys(input, CRITERION_DONE_KEYS, label);
    return Object.freeze({
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
      boundary: writeBoundary(
        input.boundary,
        `${label}.boundary`,
        RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
      ),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED) {
    assertExactKeys(input, EVIDENCE_KEYS, label);
    return Object.freeze({
      receipt: validateEvidenceReceipt(input.receipt),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_COMPLETED) {
    assertExactKeys(input, COMPLETION_KEYS, label);
    return Object.freeze({
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
      receiptId: identifier(input.receiptId, `${label}.receiptId`),
    });
  }

  if (type === RUN_EVENT_TYPES.CRITERION_REOPENED) {
    assertExactKeys(input, REOPEN_KEYS, label);
    return Object.freeze({
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
      reason: nonEmptyString(input.reason, `${label}.reason`),
    });
  }

  if (type === RUN_EVENT_TYPES.DEBT_ADDED) {
    assertExactKeys(input, DEBT_ADDED_KEYS, label, ['criterionId', 'boundary']);
    const payload = {
      debtId: identifier(input.debtId, `${label}.debtId`),
      description: nonEmptyString(input.description, `${label}.description`),
    };
    if (hasOwn(input, 'criterionId')) {
      payload.criterionId = identifier(input.criterionId, `${label}.criterionId`);
    }
    if (hasOwn(input, 'boundary')) {
      payload.boundary = writeBoundary(
        input.boundary,
        `${label}.boundary`,
        RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      );
    }
    return Object.freeze(payload);
  }

  if (type === RUN_EVENT_TYPES.DEBT_RESOLVED) {
    assertExactKeys(input, DEBT_RESOLVED_KEYS, label, ['boundary']);
    const payload = {
      debtId: identifier(input.debtId, `${label}.debtId`),
    };
    if (hasOwn(input, 'boundary')) {
      payload.boundary = writeBoundary(
        input.boundary,
        `${label}.boundary`,
        RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
      );
    }
    return Object.freeze(payload);
  }

  if (type === RUN_EVENT_TYPES.RUN_RESUMED) {
    assertExactKeys(input, RESUME_KEYS, label);
    if (!Number.isInteger(input.sourceSequence) || input.sourceSequence < 1) {
      throw new TypeError(`${label}.sourceSequence must be a positive integer`);
    }
    return Object.freeze({
      resumeToken: identifier(input.resumeToken, `${label}.resumeToken`),
      criterionId: identifier(input.criterionId, `${label}.criterionId`),
      sourceSequence: input.sourceSequence,
    });
  }

  if (type === RUN_EVENT_TYPES.RUN_HALTED) {
    assertExactKeys(input, HALT_KEYS, label);
    return Object.freeze({
      reason: nonEmptyString(input.reason, `${label}.reason`),
    });
  }

  throw new RangeError(`unknown run ledger event type "${type}"`);
}

function normalizeLedgerEvent(input) {
  assertExactKeys(input, EVENT_KEYS, 'ledger event');

  if (input.schemaVersion !== RUN_LEDGER_EVENT_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported ledger event schemaVersion "${input.schemaVersion}" `
      + `(expected ${RUN_LEDGER_EVENT_SCHEMA_VERSION})`,
    );
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new TypeError('ledger event.sequence must be a positive integer');
  }
  const type = nonEmptyString(input.type, 'ledger event.type');
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new RangeError(`unknown run ledger event type "${type}"`);
  }

  return Object.freeze({
    schemaVersion: RUN_LEDGER_EVENT_SCHEMA_VERSION,
    sequence: input.sequence,
    timestamp: timestamp(input.timestamp, 'ledger event.timestamp'),
    type,
    payload: normalizePayload(type, input.payload),
  });
}

function event(sequence, type, payload, eventTimestamp) {
  return normalizeLedgerEvent({
    schemaVersion: RUN_LEDGER_EVENT_SCHEMA_VERSION,
    sequence,
    timestamp: eventTimestamp,
    type,
    payload,
  });
}

function runPath(runDirectory, file) {
  if (typeof runDirectory !== 'string' || runDirectory.trim() === '') {
    throw new TypeError('runDirectory must be a non-empty path string');
  }
  return path.join(path.resolve(runDirectory), file);
}

function atomicCreateFile(filePath, content) {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true });
  if (existsSync(filePath)) throw new Error(`run file already exists: ${filePath}`);

  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write/rename failure.
      }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(`${label} is not complete valid JSON: ${error.message}`);
  }
}

function inspectBoundPlan(planPath, expectedHash) {
  let artifact;
  try {
    artifact = inspectPlanArtifact(planPath);
  } catch (error) {
    throw new Error(`bound plan artifact is invalid: ${error.message}`);
  }
  if (expectedHash !== undefined && artifact.sha256 !== expectedHash) {
    throw new Error(
      `bound plan artifact hash mismatch: expected ${expectedHash}, observed ${artifact.sha256}`,
    );
  }
  return artifact;
}

/**
 * Atomically create contract.json with a same-directory temp file and rename.
 * Existing contracts are never overwritten or updated.
 */
export function createRunContract(runDirectory, input) {
  const contract = validateRunContract(input);
  if (hasOwn(contract, 'planHash')) {
    inspectBoundPlan(contract.planPath, contract.planHash);
  }
  const filePath = runPath(runDirectory, RUN_FILES.contract);
  atomicCreateFile(filePath, `${JSON.stringify(contract, null, 2)}\n`);
  return contract;
}

export function readRunContract(runDirectory) {
  const filePath = runPath(runDirectory, RUN_FILES.contract);
  const input = parseJson(readFileSync(filePath, 'utf8'), RUN_FILES.contract);
  return validateRunContract(input);
}

function parseLedgerText(text) {
  if (text === '') throw new Error(`${RUN_FILES.ledger} is empty`);
  if (!text.endsWith('\n')) {
    throw new SyntaxError(`${RUN_FILES.ledger} has a truncated final event`);
  }

  const lines = text.slice(0, -1).split('\n');
  if (lines.some(line => line.trim() === '')) {
    throw new SyntaxError(`${RUN_FILES.ledger} contains a blank or partial event`);
  }

  return Object.freeze(lines.map((line, index) => (
    normalizeLedgerEvent(parseJson(line, `${RUN_FILES.ledger} line ${index + 1}`))
  )));
}

function criterionRecord(state, criterionId, eventType) {
  const criterion = state.criteria.get(criterionId);
  if (!criterion) {
    throw new Error(`${eventType} references unknown criterion "${criterionId}"`);
  }
  return criterion;
}

function goalStatusProjection(criteria) {
  const projection = Object.fromEntries(
    RUN_GOAL_STATUSES.map(status => [status, []]),
  );
  for (const criterion of criteria) {
    projection[criterion.goalStatus].push(criterion.id);
  }
  return Object.freeze(Object.fromEntries(
    RUN_GOAL_STATUSES.map(status => [
      status,
      Object.freeze(projection[status]),
    ]),
  ));
}

/**
 * Pure reducer: derived mutable state comes only from the ordered event sequence.
 * It accepts parsed event objects and never reads contract.json or state.json.
 */
export function replayRunLedger(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError('ledger replay requires at least one event');
  }
  const events = inputs.map(normalizeLedgerEvent);
  const state = {
    runId: null,
    contractSchemaVersion: null,
    criterionOrder: [],
    criteria: new Map(),
    blockerIds: [],
    debt: new Map(),
    evidenceIds: new Set(),
    receipts: new Map(),
    resumeTokens: new Set(),
    resumes: [],
    plan: null,
    halted: false,
    haltReason: null,
    haltSequence: null,
  };

  for (let index = 0; index < events.length; index++) {
    const current = events[index];
    const expectedSequence = index + 1;
    if (current.sequence !== expectedSequence) {
      throw new Error(
        `ledger event sequence must be contiguous: expected ${expectedSequence}, `
        + `received ${current.sequence}`,
      );
    }
    if (state.halted) {
      throw new Error(`ledger event ${current.sequence} appears after terminal run.halted`);
    }

    const payload = current.payload;
    if (current.type === RUN_EVENT_TYPES.CONTRACT_CREATED) {
      if (current.sequence !== 1 || state.runId !== null) {
        throw new Error('contract.created must be the first and only contract creation event');
      }
      state.runId = payload.runId;
      state.contractSchemaVersion = payload.contractSchemaVersion;
      state.criterionOrder = [...payload.criterionIds];
      state.blockerIds = [...payload.blockerIds];
      if (hasOwn(payload, 'planHash')) {
        state.plan = {
          path: payload.planPath,
          initialHash: payload.planHash,
          boundHash: payload.planHash,
          rebindings: [],
          deviation: null,
        };
      }
      for (const criterionId of payload.criterionIds) {
        state.criteria.set(criterionId, {
          id: criterionId,
          status: 'declared',
          goalStatus: 'planned',
          attemptIds: [],
          currentAttemptId: null,
          evidenceIds: [],
          completionReceiptId: null,
          completedSequence: null,
          reopenedSequence: null,
          doneSequence: null,
          verifiedSequence: null,
        });
      }
      continue;
    }

    if (state.runId === null) {
      throw new Error('contract.created must be the first ledger event');
    }

    if (current.type === RUN_EVENT_TYPES.PLAN_REBOUND) {
      if (!state.plan) {
        throw new Error(`${current.type} requires a contract-bound plan`);
      }
      if (payload.fromHash !== state.plan.boundHash) {
        throw new Error(
          `${current.type} expected current binding "${state.plan.boundHash}", `
          + `received "${payload.fromHash}"`,
        );
      }
      state.plan.rebindings.push(Object.freeze({
        fromHash: payload.fromHash,
        toHash: payload.toHash,
        reason: payload.reason,
        sequence: current.sequence,
      }));
      state.plan.boundHash = payload.toHash;
      state.plan.deviation = null;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED) {
      if (!state.plan) {
        throw new Error(`${current.type} requires a contract-bound plan`);
      }
      if (payload.boundHash !== state.plan.boundHash) {
        throw new Error(
          `${current.type} expected current binding "${state.plan.boundHash}", `
          + `received "${payload.boundHash}"`,
        );
      }
      state.plan.deviation = {
        boundHash: payload.boundHash,
        observedHash: payload.observedHash,
        reason: payload.reason,
        sequence: current.sequence,
      };
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_OPENED) {
      const criterion = criterionRecord(state, payload.criterionId, current.type);
      if (criterion.status !== 'declared') {
        throw new Error(
          `${current.type} requires declared criterion "${payload.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      criterion.status = 'open';
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED) {
      const criterion = criterionRecord(state, payload.criterionId, current.type);
      if (criterion.status !== 'open') {
        throw new Error(
          `${current.type} requires open criterion "${payload.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      if (criterion.attemptIds.includes(payload.attemptId)) {
        throw new Error(
          `${current.type} received duplicate attempt id "${payload.attemptId}" `
          + `for criterion "${payload.criterionId}"`,
        );
      }
      criterion.attemptIds.push(payload.attemptId);
      criterion.currentAttemptId = payload.attemptId;
      criterion.goalStatus = 'planned';
      criterion.doneSequence = null;
      criterion.verifiedSequence = null;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_DONE) {
      const criterion = criterionRecord(state, payload.criterionId, current.type);
      if (criterion.status !== 'open') {
        throw new Error(
          `${current.type} requires open criterion "${payload.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      if (criterion.currentAttemptId === null) {
        throw new Error(
          `${current.type} requires a current attempt for criterion `
          + `"${payload.criterionId}"`,
        );
      }
      if (criterion.goalStatus !== 'planned') {
        throw new Error(
          `${current.type} requires planned goal status for criterion `
          + `"${payload.criterionId}", found ${criterion.goalStatus}`,
        );
      }
      criterion.goalStatus = 'done';
      criterion.doneSequence = current.sequence;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED) {
      const receipt = payload.receipt;
      const criterion = criterionRecord(state, receipt.criterionId, current.type);
      if (criterion.status !== 'open') {
        throw new Error(
          `${current.type} requires open criterion "${receipt.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      if (criterion.currentAttemptId === null) {
        throw new Error(
          `${current.type} requires a current attempt for criterion "${receipt.criterionId}"`,
        );
      }
      if (receipt.attemptId !== criterion.currentAttemptId) {
        throw new Error(
          `${current.type} receipt "${receipt.id}" belongs to stale attempt `
          + `"${receipt.attemptId}" (current "${criterion.currentAttemptId}")`,
        );
      }
      if (state.evidenceIds.has(receipt.id)) {
        throw new Error(`duplicate evidence receipt id "${receipt.id}"`);
      }
      state.evidenceIds.add(receipt.id);
      state.receipts.set(receipt.id, receipt);
      criterion.evidenceIds.push(receipt.id);
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_COMPLETED) {
      const criterion = criterionRecord(state, payload.criterionId, current.type);
      if (criterion.status !== 'open') {
        throw new Error(
          `${current.type} requires open criterion "${payload.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      const receipt = state.receipts.get(payload.receiptId);
      if (!receipt) {
        throw new Error(
          `${current.type} references missing evidence receipt "${payload.receiptId}"`,
        );
      }
      if (receipt.criterionId !== payload.criterionId) {
        throw new Error(
          `${current.type} receipt "${payload.receiptId}" belongs to criterion `
          + `"${receipt.criterionId}", not "${payload.criterionId}"`,
        );
      }
      if (criterion.currentAttemptId === null
        || receipt.attemptId !== criterion.currentAttemptId) {
        throw new Error(
          `${current.type} receipt "${payload.receiptId}" belongs to stale attempt `
          + `"${receipt.attemptId}" (current "${String(criterion.currentAttemptId)}")`,
        );
      }
      const latestReceiptId = criterion.evidenceIds.at(-1);
      if (latestReceiptId !== payload.receiptId) {
        throw new Error(
          `${current.type} must reference the latest receipt for the current attempt `
          + `(expected "${latestReceiptId}", received "${payload.receiptId}")`,
        );
      }
      if (receipt.result !== 'pass') {
        throw new Error(
          `${current.type} requires a passing receipt; "${payload.receiptId}" recorded failure`,
        );
      }
      criterion.status = 'complete';
      criterion.goalStatus = 'verified';
      criterion.completionReceiptId = payload.receiptId;
      criterion.completedSequence = current.sequence;
      criterion.verifiedSequence = current.sequence;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.CRITERION_REOPENED) {
      const criterion = criterionRecord(state, payload.criterionId, current.type);
      if (criterion.status !== 'complete') {
        throw new Error(
          `${current.type} requires complete criterion "${payload.criterionId}", `
          + `found ${criterion.status}`,
        );
      }
      criterion.status = 'open';
      criterion.currentAttemptId = null;
      criterion.completionReceiptId = null;
      criterion.completedSequence = null;
      criterion.reopenedSequence = current.sequence;
      criterion.goalStatus = 'planned';
      criterion.doneSequence = null;
      criterion.verifiedSequence = null;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.DEBT_ADDED) {
      if (state.debt.has(payload.debtId)) {
        throw new Error(`duplicate debt id "${payload.debtId}"`);
      }
      if (payload.criterionId) criterionRecord(state, payload.criterionId, current.type);
      state.debt.set(payload.debtId, {
        id: payload.debtId,
        description: payload.description,
        ...(payload.criterionId ? { criterionId: payload.criterionId } : {}),
        status: 'open',
        addedSequence: current.sequence,
        ...(payload.boundary ? { addedBoundary: payload.boundary } : {}),
        resolvedSequence: null,
        resolvedBoundary: null,
      });
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.DEBT_RESOLVED) {
      const debt = state.debt.get(payload.debtId);
      if (!debt) throw new Error(`${current.type} references unknown debt "${payload.debtId}"`);
      if (debt.status !== 'open') {
        throw new Error(`${current.type} requires open debt "${payload.debtId}"`);
      }
      debt.status = 'resolved';
      debt.resolvedSequence = current.sequence;
      if (payload.boundary) debt.resolvedBoundary = payload.boundary;
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.RUN_RESUMED) {
      criterionRecord(state, payload.criterionId, current.type);
      const expectedCriterionId = state.criterionOrder.find(
        criterionId => state.criteria.get(criterionId).status === 'open',
      );
      if (!expectedCriterionId) {
        throw new Error(`${current.type} requires a ledger-open criterion`);
      }
      if (payload.criterionId !== expectedCriterionId) {
        throw new Error(
          `${current.type} must select next ledger-open criterion `
          + `"${expectedCriterionId}", received "${payload.criterionId}"`,
        );
      }
      if (payload.sourceSequence !== current.sequence - 1) {
        throw new Error(
          `${current.type} sourceSequence must identify the immediately preceding `
          + `ledger checkpoint (expected ${current.sequence - 1}, `
          + `received ${payload.sourceSequence})`,
        );
      }
      if (state.resumeTokens.has(payload.resumeToken)) {
        throw new Error(`duplicate resume token "${payload.resumeToken}"`);
      }
      state.resumeTokens.add(payload.resumeToken);
      state.resumes.push(Object.freeze({
        resumeToken: payload.resumeToken,
        criterionId: payload.criterionId,
        sourceSequence: payload.sourceSequence,
        timestamp: current.timestamp,
        sequence: current.sequence,
      }));
      continue;
    }

    if (current.type === RUN_EVENT_TYPES.RUN_HALTED) {
      state.halted = true;
      state.haltReason = payload.reason;
      state.haltSequence = current.sequence;
    }
  }

  if (state.runId === null) throw new Error('ledger has no contract.created event');
  const unopened = state.criterionOrder.filter(
    criterionId => state.criteria.get(criterionId).status === 'declared',
  );
  if (unopened.length) {
    throw new Error(
      `ledger initialization is incomplete; criterion.opened missing for: ${unopened.join(', ')}`,
    );
  }

  const criteria = state.criterionOrder.map((criterionId) => {
    const criterion = state.criteria.get(criterionId);
    return Object.freeze({
      id: criterion.id,
      status: criterion.status,
      goalStatus: criterion.goalStatus,
      attemptIds: Object.freeze([...criterion.attemptIds]),
      currentAttemptId: criterion.currentAttemptId,
      evidenceIds: Object.freeze([...criterion.evidenceIds]),
      completionReceiptId: criterion.completionReceiptId,
      completedSequence: criterion.completedSequence,
      reopenedSequence: criterion.reopenedSequence,
      doneSequence: criterion.doneSequence,
      verifiedSequence: criterion.verifiedSequence,
      freshness: criterion.status === 'complete' ? 'unchecked' : 'not-applicable',
      staleReason: null,
    });
  });
  const goalStatus = goalStatusProjection(criteria);
  const openCriteria = criteria.filter(entry => entry.status === 'open').map(entry => entry.id);
  const completeCriteria = criteria
    .filter(entry => entry.status === 'complete')
    .map(entry => entry.id);
  const debt = [...state.debt.values()].map(entry => Object.freeze({ ...entry }));
  const openDebt = debt.filter(entry => entry.status === 'open');
  const resolvedDebt = debt.filter(entry => entry.status === 'resolved');
  const plan = state.plan
    ? Object.freeze({
      path: state.plan.path,
      initialHash: state.plan.initialHash,
      boundHash: state.plan.boundHash,
      rebindings: Object.freeze([...state.plan.rebindings]),
      deviation: state.plan.deviation
        ? Object.freeze({ ...state.plan.deviation })
        : null,
    })
    : null;

  return Object.freeze({
    schemaVersion: RUN_DERIVED_STATE_SCHEMA_VERSION,
    source: 'ledger',
    runId: state.runId,
    contractSchemaVersion: state.contractSchemaVersion,
    lastSequence: events.length,
    criteria: Object.freeze(criteria),
    goalStatus,
    openCriteria: Object.freeze(openCriteria),
    completeCriteria: Object.freeze(completeCriteria),
    blockerIds: Object.freeze([...state.blockerIds]),
    receipts: Object.freeze([...state.receipts.values()]),
    resumes: Object.freeze([...state.resumes]),
    debt: Object.freeze({
      open: Object.freeze(openDebt),
      resolved: Object.freeze(resolvedDebt),
    }),
    ...(plan ? { plan } : {}),
    halted: state.halted,
    haltReason: state.haltReason,
    haltSequence: state.haltSequence,
    complete: !state.halted
      && openCriteria.length === 0
      && openDebt.length === 0
      && completeCriteria.length === criteria.length,
  });
}

export function readRunLedger(runDirectory) {
  const filePath = runPath(runDirectory, RUN_FILES.ledger);
  const events = parseLedgerText(readFileSync(filePath, 'utf8'));
  replayRunLedger(events);
  return events;
}

function assertContractLedgerBinding(contract, events) {
  const created = events[0];
  if (!created || created.type !== RUN_EVENT_TYPES.CONTRACT_CREATED) {
    throw new Error('ledger must begin with contract.created');
  }
  const expectedCriteria = contract.criteria.map(entry => entry.id);
  const expectedBlockers = contract.blockers.map(entry => entry.id);
  const contractHasPlan = hasOwn(contract, 'planHash');
  const ledgerHasPlan = hasOwn(created.payload, 'planHash');
  if (created.payload.contractSchemaVersion !== contract.schemaVersion
    || created.payload.runId !== contract.runId
    || JSON.stringify(created.payload.criterionIds) !== JSON.stringify(expectedCriteria)
    || JSON.stringify(created.payload.blockerIds) !== JSON.stringify(expectedBlockers)
    || contractHasPlan !== ledgerHasPlan
    || (contractHasPlan && (
      created.payload.planPath !== contract.planPath
      || created.payload.planHash !== contract.planHash
    ))) {
    throw new Error('contract.json does not match the ledger contract.created binding');
  }
}

function assertReceiptContractBinding(contract, receipt) {
  if (receipt.runId !== contract.runId) {
    throw new Error(
      `evidence receipt "${receipt.id}" belongs to run "${receipt.runId}", `
      + `not "${contract.runId}"`,
    );
  }
  const criterion = contract.criteria.find(entry => entry.id === receipt.criterionId);
  if (!criterion) {
    throw new Error(
      `evidence receipt "${receipt.id}" references unknown criterion `
      + `"${receipt.criterionId}"`,
    );
  }
  const check = contract.checks.find(entry => entry.id === receipt.check.id);
  if (!check) {
    throw new Error(
      `evidence receipt "${receipt.id}" references unknown check "${receipt.check.id}"`,
    );
  }
  if (check.criterionId !== receipt.criterionId) {
    throw new Error(
      `evidence receipt "${receipt.id}" check "${check.id}" belongs to criterion `
      + `"${check.criterionId}", not "${receipt.criterionId}"`,
    );
  }
  if (check.type !== receipt.check.type || check.definition !== receipt.check.definition) {
    throw new Error(
      `evidence receipt "${receipt.id}" does not record the exact contract check `
      + `"${check.id}"`,
    );
  }
}

function pathContains(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative));
}

function canonicalReceiptTargetPath(root, relativeTarget) {
  const segments = relativeTarget.split('/');
  const absolute = path.resolve(root, ...segments);
  try {
    return realpathSync(absolute);
  } catch {
    try {
      return path.resolve(realpathSync(root), ...segments);
    } catch {
      return absolute;
    }
  }
}

function inodeKey(metadata) {
  return `${metadata.dev}:${metadata.ino}`;
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function throwProtectedMetadataReadError(label, error) {
  throw new Error(
    `cannot inspect protected run metadata "${label}": ${error.message}`,
  );
}

function collectProtectedInodes(entryPath, label, protectedInodes, seenDirectories) {
  let metadata;
  try {
    metadata = lstatSync(entryPath, { bigint: true });
  } catch (error) {
    if (isMissingPathError(error)) return;
    throwProtectedMetadataReadError(label, error);
  }
  const key = inodeKey(metadata);
  if (!protectedInodes.has(key)) protectedInodes.set(key, label);
  if (metadata.isSymbolicLink()) {
    let canonical;
    try {
      canonical = realpathSync(entryPath);
    } catch (error) {
      if (isMissingPathError(error)) return;
      throwProtectedMetadataReadError(label, error);
    }
    collectProtectedInodes(
      canonical,
      label,
      protectedInodes,
      seenDirectories,
    );
    return;
  }
  if (!metadata.isDirectory()) return;
  if (seenDirectories.has(key)) return;
  seenDirectories.add(key);
  let entries;
  try {
    entries = readdirSync(entryPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return;
    throwProtectedMetadataReadError(label, error);
  }
  for (const entry of entries) {
    collectProtectedInodes(
      path.join(entryPath, entry.name),
      label,
      protectedInodes,
      seenDirectories,
    );
  }
}

function protectedInodeLabel(entryPath, protectedInodes, seenDirectories) {
  let metadata;
  try {
    metadata = lstatSync(entryPath, { bigint: true });
  } catch {
    return null;
  }
  const key = inodeKey(metadata);
  const protectedLabel = protectedInodes.get(key);
  if (protectedLabel) return protectedLabel;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return null;
  if (seenDirectories.has(key)) return null;
  seenDirectories.add(key);
  let entries;
  try {
    entries = readdirSync(entryPath, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const childLabel = protectedInodeLabel(
      path.join(entryPath, entry.name),
      protectedInodes,
      seenDirectories,
    );
    if (childLabel) return childLabel;
  }
  return null;
}

function assertReceiptTargetsOutsideRunMetadata(runDirectory, receipt) {
  const runRoot = realpathSync(path.resolve(runDirectory));
  const protectedPaths = RUN_RECEIPT_METADATA_PATHS.flatMap((entry) => {
    const lexical = path.join(runRoot, entry);
    const canonical = canonicalReceiptTargetPath(runRoot, entry);
    return [
      { path: lexical, label: entry },
      { path: canonical, label: entry },
    ];
  });
  const protectedInodes = new Map();
  const protectedDirectories = new Set();
  for (const entry of protectedPaths) {
    collectProtectedInodes(
      entry.path,
      entry.label,
      protectedInodes,
      protectedDirectories,
    );
  }
  for (const relativeTarget of receipt.target.paths) {
    const lexicalTarget = path.resolve(
      receipt.target.root,
      ...relativeTarget.split('/'),
    );
    const canonicalTarget = canonicalReceiptTargetPath(
      receipt.target.root,
      relativeTarget,
    );
    const protectedPath = protectedPaths.find(entry => (
      [lexicalTarget, canonicalTarget].some(targetPath => (
        pathContains(targetPath, entry.path) || pathContains(entry.path, targetPath)
      ))
    ));
    if (protectedPath) {
      throw new TypeError(
        `evidence receipt "${receipt.id}" target path "${relativeTarget}" `
        + `must not include run metadata "${protectedPath.label}"`,
      );
    }
    const protectedLabel = protectedInodeLabel(
      lexicalTarget,
      protectedInodes,
      new Set(),
    );
    if (protectedLabel) {
      throw new TypeError(
        `evidence receipt "${receipt.id}" target path "${relativeTarget}" `
        + `must not include run metadata "${protectedLabel}" through a hard-link alias`,
      );
    }
  }
}

function currentReceiptIssue(runDirectory, receipt) {
  try {
    const currentTarget = computeTargetIdentity(
      receipt.target.root,
      receipt.target.paths,
    );
    if (currentTarget.treeHash !== receipt.target.treeHash) {
      return 'target_hash_mismatch';
    }
  } catch {
    return 'target_unreadable';
  }

  try {
    const artifact = artifactIdentity(runDirectory, receipt.artifact.path);
    if (artifact.sha256 !== receipt.artifact.sha256) {
      return 'artifact_digest_mismatch';
    }
  } catch {
    return 'artifact_unreadable';
  }
  return null;
}

function assertReceiptCurrent(runDirectory, receipt) {
  const issue = currentReceiptIssue(runDirectory, receipt);
  if (issue) {
    throw new Error(`evidence receipt "${receipt.id}" is invalid: ${issue}`);
  }
}

function assertReceiptBindings(runDirectory, contract, state) {
  for (const receipt of state.receipts) {
    assertReceiptContractBinding(contract, receipt);
    assertReceiptTargetsOutsideRunMetadata(runDirectory, receipt);
  }
}

function applyCurrentPlanBinding(state) {
  if (!state.plan) return state;
  const artifact = inspectBoundPlan(state.plan.path);
  if (artifact.sha256 === state.plan.boundHash) {
    return Object.freeze({
      ...state,
      plan: Object.freeze({
        ...state.plan,
        currentHash: artifact.sha256,
        status: 'bound',
      }),
    });
  }
  const deviation = state.plan.deviation;
  if (deviation
    && deviation.boundHash === state.plan.boundHash
    && deviation.observedHash === artifact.sha256) {
    return Object.freeze({
      ...state,
      plan: Object.freeze({
        ...state.plan,
        currentHash: artifact.sha256,
        status: 'deviation-recorded',
      }),
    });
  }
  throw new Error(
    `silent plan divergence: contract/ledger binds ${state.plan.boundHash}, `
    + `but ${state.plan.path} hashes to ${artifact.sha256}; `
    + 'append plan.rebound or plan.deviation.recorded',
  );
}

/**
 * Freshness invalidation is derived-only: loading never mutates ledger.jsonl.
 * The ledger plus current bytes under each receipt's target paths and artifact
 * fully determine this projection. A repair must append criterion.reopened
 * before starting a new attempt, preserving the historical completion event.
 */
function applyCurrentReceiptFreshness(runDirectory, state) {
  const receiptById = new Map(state.receipts.map(receipt => [receipt.id, receipt]));
  const criteria = state.criteria.map((criterion) => {
    if (criterion.status !== 'complete') return criterion;
    const receipt = receiptById.get(criterion.completionReceiptId);
    const issue = receipt
      ? currentReceiptIssue(runDirectory, receipt)
      : 'completion_receipt_missing';
    if (!issue) {
      return Object.freeze({
        ...criterion,
        freshness: 'fresh',
      });
    }
    return Object.freeze({
      ...criterion,
      status: 'open',
      goalStatus: 'done',
      currentAttemptId: null,
      completedSequence: null,
      doneSequence: criterion.doneSequence
        ?? criterion.verifiedSequence
        ?? criterion.completedSequence,
      verifiedSequence: null,
      freshness: 'stale',
      staleReason: issue,
    });
  });
  const goalStatus = goalStatusProjection(criteria);
  const openCriteria = criteria.filter(entry => entry.status === 'open').map(entry => entry.id);
  const completeCriteria = criteria
    .filter(entry => entry.status === 'complete')
    .map(entry => entry.id);
  return Object.freeze({
    ...state,
    criteria: Object.freeze(criteria),
    goalStatus,
    openCriteria: Object.freeze(openCriteria),
    completeCriteria: Object.freeze(completeCriteria),
    freshnessProjection: 'ledger+current-target',
    complete: !state.halted
      && openCriteria.length === 0
      && state.debt.open.length === 0
      && completeCriteria.length === criteria.length,
  });
}

/**
 * Create an immutable contract and atomically seed the ledger with typed creation/open events.
 * No state.json cache or .fablever_state snapshot is created.
 */
export function createRun(runDirectory, input, {
  timestamp: eventTimestamp = new Date().toISOString(),
} = {}) {
  const normalizedTimestamp = timestamp(eventTimestamp, 'createRun timestamp');
  const contractPath = runPath(runDirectory, RUN_FILES.contract);
  const ledgerPath = runPath(runDirectory, RUN_FILES.ledger);
  if (existsSync(contractPath) || existsSync(ledgerPath)) {
    throw new Error('run creation requires absent contract.json and ledger.jsonl');
  }

  const contract = createRunContract(runDirectory, input);
  try {
    const initialEvents = [
      event(1, RUN_EVENT_TYPES.CONTRACT_CREATED, {
        contractSchemaVersion: contract.schemaVersion,
        runId: contract.runId,
        criterionIds: contract.criteria.map(entry => entry.id),
        blockerIds: contract.blockers.map(entry => entry.id),
        ...(hasOwn(contract, 'planHash')
          ? { planPath: contract.planPath, planHash: contract.planHash }
          : {}),
      }, normalizedTimestamp),
      ...contract.criteria.map((criterion, index) => (
        event(index + 2, RUN_EVENT_TYPES.CRITERION_OPENED, {
          criterionId: criterion.id,
        }, normalizedTimestamp)
      )),
    ];
    const state = replayRunLedger(initialEvents);
    const ledgerText = initialEvents.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    atomicCreateFile(ledgerPath, ledgerText);
    return Object.freeze({
      contract,
      events: Object.freeze(initialEvents),
      state,
    });
  } catch (error) {
    rmSync(contractPath, { force: true });
    throw error;
  }
}

/**
 * Append one legal event using O_APPEND semantics. Existing ledger bytes are never rewritten.
 */
export function appendRunEvent(runDirectory, type, payload, {
  timestamp: eventTimestamp = new Date().toISOString(),
} = {}) {
  assertLiveWriteBoundary(type, payload);
  const contract = readRunContract(runDirectory);
  const events = readRunLedger(runDirectory);
  assertContractLedgerBinding(contract, events);

  const next = event(
    events.length + 1,
    type,
    payload,
    timestamp(eventTimestamp, 'appendRunEvent timestamp'),
  );
  if (next.type === RUN_EVENT_TYPES.RUN_RESUMED) {
    const replayed = replayRunLedger(events);
    assertReceiptBindings(runDirectory, contract, replayed);
    const currentState = applyCurrentReceiptFreshness(
      runDirectory,
      applyCurrentPlanBinding(replayed),
    );
    if (currentState.halted) {
      throw new Error('run.resumed cannot resume a halted run');
    }
    const expectedCriterionId = currentState.openCriteria[0];
    if (!expectedCriterionId) {
      throw new Error('run.resumed requires an unresolved criterion');
    }
    if (next.payload.sourceSequence !== currentState.lastSequence) {
      throw new Error(
        `run.resumed sourceSequence is stale (expected ${currentState.lastSequence}, `
        + `received ${next.payload.sourceSequence})`,
      );
    }
    if (next.payload.criterionId !== expectedCriterionId) {
      throw new Error(
        `run.resumed must select next unresolved criterion "${expectedCriterionId}", `
        + `received "${next.payload.criterionId}"`,
      );
    }
  }
  const nextState = replayRunLedger([...events, next]);
  assertReceiptBindings(runDirectory, contract, nextState);
  if (next.type === RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED) {
    assertReceiptCurrent(runDirectory, next.payload.receipt);
  }
  if (next.type === RUN_EVENT_TYPES.CRITERION_COMPLETED) {
    const receipt = nextState.receipts.find(entry => entry.id === next.payload.receiptId);
    assertReceiptCurrent(runDirectory, receipt);
  }
  applyCurrentPlanBinding(nextState);
  appendFileSync(
    runPath(runDirectory, RUN_FILES.ledger),
    `${JSON.stringify(next)}\n`,
    { encoding: 'utf8', flag: 'a', mode: 0o600 },
  );
  return next;
}

function planSteeringState(runDirectory) {
  const contract = readRunContract(runDirectory);
  const events = readRunLedger(runDirectory);
  assertContractLedgerBinding(contract, events);
  const state = replayRunLedger(events);
  if (!state.plan) throw new Error('run contract has no plan hash binding');
  return state;
}

export function rebindRunPlan(runDirectory, {
  reason,
  timestamp: eventTimestamp = new Date().toISOString(),
} = {}) {
  const state = planSteeringState(runDirectory);
  const artifact = inspectBoundPlan(state.plan.path);
  if (artifact.sha256 === state.plan.boundHash) {
    throw new Error('plan rebind requires a material content change');
  }
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.PLAN_REBOUND,
    {
      fromHash: state.plan.boundHash,
      toHash: artifact.sha256,
      reason: nonEmptyString(reason, 'plan rebind reason'),
    },
    { timestamp: eventTimestamp },
  );
}

export function recordRunPlanDeviation(runDirectory, {
  reason,
  timestamp: eventTimestamp = new Date().toISOString(),
} = {}) {
  const state = planSteeringState(runDirectory);
  const artifact = inspectBoundPlan(state.plan.path);
  if (artifact.sha256 === state.plan.boundHash) {
    throw new Error('plan deviation requires content that differs from the bound plan hash');
  }
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.PLAN_DEVIATION_RECORDED,
    {
      boundHash: state.plan.boundHash,
      observedHash: artifact.sha256,
      reason: nonEmptyString(reason, 'plan deviation reason'),
    },
    { timestamp: eventTimestamp },
  );
}

function boundaryWriteOptions(options, expectedBoundary, label) {
  assertExactKeys(options, ['boundary', 'timestamp'], label, ['timestamp']);
  const boundary = writeBoundary(
    options.boundary,
    `${label}.boundary`,
    expectedBoundary,
  );
  return Object.freeze({
    boundary,
    appendOptions: hasOwn(options, 'timestamp')
      ? Object.freeze({ timestamp: options.timestamp })
      : Object.freeze({}),
  });
}

/**
 * Record the natural boundary where work on the current criterion attempt is done.
 * This does not claim verification; only criterion.completed with current PASS
 * evidence can derive goalStatus "verified".
 */
export function markCriterionDone(runDirectory, criterionId, options = {}) {
  const boundary = boundaryWriteOptions(
    options,
    RUN_WRITE_BOUNDARIES.CRITERION_TRANSITION,
    'criterion done options',
  );
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.CRITERION_DONE,
    {
      criterionId,
      boundary: boundary.boundary,
    },
    boundary.appendOptions,
  );
}

/**
 * Verification debt remains a debt.added ledger row; this helper only makes the
 * natural-boundary write rule explicit and opt-in.
 */
export function addVerificationDebt(runDirectory, input, options = {}) {
  assertExactKeys(
    input,
    VERIFICATION_DEBT_INPUT_KEYS,
    'verification debt input',
    ['criterionId'],
  );
  const boundary = boundaryWriteOptions(
    options,
    RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    'verification debt options',
  );
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.DEBT_ADDED,
    {
      debtId: input.debtId,
      description: input.description,
      ...(hasOwn(input, 'criterionId') ? { criterionId: input.criterionId } : {}),
      boundary: boundary.boundary,
    },
    boundary.appendOptions,
  );
}

export function resolveVerificationDebt(
  runDirectory,
  debtId,
  options = {},
) {
  const boundary = boundaryWriteOptions(
    options,
    RUN_WRITE_BOUNDARIES.VERIFICATION_TRANSITION,
    'verification debt resolution options',
  );
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.DEBT_RESOLVED,
    {
      debtId,
      boundary: boundary.boundary,
    },
    boundary.appendOptions,
  );
}

export function startCriterionAttempt(runDirectory, criterionId, attemptId, options = {}) {
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.CRITERION_ATTEMPT_STARTED,
    { criterionId, attemptId },
    options,
  );
}

function receiptFromSource(source) {
  if (typeof source !== 'string') return validateEvidenceReceipt(source);
  const filePath = path.resolve(nonEmptyString(source, 'receipt source path'));
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`evidence receipt is unreadable at ${filePath}: ${error.message}`);
  }
  if (text.trim() === '') {
    throw new Error(`evidence receipt is empty at ${filePath}`);
  }
  return validateEvidenceReceipt(parseJson(text, `evidence receipt at ${filePath}`));
}

/**
 * Import a receipt object or JSON file into the typed ledger event. After append,
 * only the embedded normalized receipt is authoritative.
 */
export function recordCriterionEvidence(runDirectory, receiptSource, options = {}) {
  const receipt = receiptFromSource(receiptSource);
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.CRITERION_EVIDENCE_RECORDED,
    { receipt },
    options,
  );
}

export function completeCriterion(runDirectory, criterionId, receiptId, options = {}) {
  return appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.CRITERION_COMPLETED,
    { criterionId, receiptId },
    options,
  );
}

/**
 * Validate contract/ledger binding, then derive state exclusively by ledger replay.
 * RUN_FILES.cache is never opened, merged, or trusted.
 */
export function loadRunState(runDirectory) {
  const contract = readRunContract(runDirectory);
  const events = readRunLedger(runDirectory);
  assertContractLedgerBinding(contract, events);
  const state = replayRunLedger(events);
  assertReceiptBindings(runDirectory, contract, state);
  const planBoundState = applyCurrentPlanBinding(state);
  return applyCurrentReceiptFreshness(runDirectory, planBoundState);
}

function recoveryCriterion(contract, state) {
  const criterionId = state.openCriteria[0];
  if (!criterionId) return null;
  const criterion = contract.criteria.find(entry => entry.id === criterionId);
  if (!criterion) {
    throw new Error(
      `run recovery selected criterion missing from contract: "${criterionId}"`,
    );
  }
  return criterion;
}

function recoveryResult(status, state, nextCriterion, resume = null) {
  return Object.freeze({
    status,
    source: 'contract+ledger',
    conversationReplayRequired: false,
    nextCriterion,
    completedCriteria: state.completeCriteria,
    shouldRegeneratePlan: false,
    planAction: state.plan ? 'reuse-bound-plan' : 'none',
    resume,
    checkpoint: state,
  });
}

/**
 * Reconstruct a restart checkpoint from the one authoritative run state.
 *
 * This is explicit/opt-in: no shipped path calls it automatically. It never
 * reads conversation, state.json, or .fablever_state, and its only write is a
 * reducer-neutral run.resumed audit event in the existing append-only ledger.
 */
export function recoverRunFromAuthority(runDirectory, options = {}) {
  assertExactKeys(
    options,
    ['resumeToken', 'timestamp'],
    'restart recovery options',
    ['resumeToken', 'timestamp'],
  );
  const requestedResumeToken = hasOwn(options, 'resumeToken')
    ? identifier(options.resumeToken, 'restart recovery resumeToken')
    : null;
  const resumedAt = timestamp(
    options.timestamp ?? new Date().toISOString(),
    'restart recovery timestamp',
  );

  const contract = readRunContract(runDirectory);
  const state = loadRunState(runDirectory);
  const nextCriterion = recoveryCriterion(contract, state);
  const latestResume = state.resumes.at(-1);
  const reusableResumeToken = latestResume
    && latestResume.sequence === state.lastSequence
    && latestResume.criterionId === nextCriterion?.id
    ? latestResume.resumeToken
    : null;
  const resumeToken = requestedResumeToken ?? reusableResumeToken;
  const existing = state.resumes.find(entry => entry.resumeToken === resumeToken);
  if (existing) {
    if (existing.sequence !== state.lastSequence
      || existing.criterionId !== nextCriterion?.id) {
      throw new Error(
        `resume token "${resumeToken}" no longer identifies the current recovery checkpoint`,
      );
    }
    return recoveryResult(
      'already-resumed',
      state,
      nextCriterion,
      Object.freeze({
        token: existing.resumeToken,
        resumedAt: existing.timestamp,
        sourceSequence: existing.sourceSequence,
        eventSequence: existing.sequence,
      }),
    );
  }

  if (state.halted) {
    return recoveryResult('halted', state, nextCriterion);
  }
  if (!nextCriterion) {
    return recoveryResult(
      state.complete ? 'already-complete' : 'blocked-no-open-criterion',
      state,
      null,
    );
  }
  const nextCriterionState = state.criteria.find(
    entry => entry.id === nextCriterion.id,
  );
  if (nextCriterionState?.freshness === 'stale') {
    return recoveryResult('reopen-required', state, nextCriterion);
  }

  const effectiveResumeToken = resumeToken ?? `resume-${randomUUID()}`;
  const resumeEvent = appendRunEvent(
    runDirectory,
    RUN_EVENT_TYPES.RUN_RESUMED,
    {
      resumeToken: effectiveResumeToken,
      criterionId: nextCriterion.id,
      sourceSequence: state.lastSequence,
    },
    { timestamp: resumedAt },
  );
  const checkpoint = loadRunState(runDirectory);
  return recoveryResult(
    'resumed',
    checkpoint,
    recoveryCriterion(contract, checkpoint),
    Object.freeze({
      token: effectiveResumeToken,
      resumedAt: resumeEvent.timestamp,
      sourceSequence: resumeEvent.payload.sourceSequence,
      eventSequence: resumeEvent.sequence,
    }),
  );
}

export function assertRunPlanBinding(runDirectory) {
  const state = loadRunState(runDirectory);
  if (!state.plan) throw new Error('run contract has no plan hash binding');
  return state.plan;
}
