#!/usr/bin/env node
// G5.4 — reproducible v1.3.0 default-behavior snapshot and opt-in flag scan.
// Zero dependencies; baseline bytes are read with `git show <v1.3.0 tag commit>:<path>` — pinned to the
// immutable RELEASE TAG, never `HEAD` (a HEAD baseline self-compares once the upgrade is committed).
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OPTIN_MANIFEST_PATH = path.join(REPO, 'orchestration', 'optin-flags.json');
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.sh', '.bash', '.zsh']);
const NON_ENV_FABLE_TOKENS = new Set([
  'FABLE_DEV_LINE',
  'FABLE_EVAL',
  'FABLE_HOME_PTR',
  'FABLE_HOOK_EXEMPTION_PROBE_SENTINEL',
  'FABLE_TOOLUSE_LINE',
]);
const MAX_BUFFER = 16 * 1024 * 1024;
export const DEFAULT_RUNTIME_SURFACES = Object.freeze([
  'hooks',
  'mcp',
  'installFileFootprint',
  'recipeDispatch',
]);

// The baseline is the v1.3.0 RELEASE TAG — never the moving `HEAD`. This is load-bearing: the upgrade is
// currently uncommitted, so HEAD *happens* to equal the pre-upgrade tree today. The moment the upgrade is
// committed, a HEAD baseline would compare the upgrade against itself and pass forever — the charter #2
// proof would die silently. Pinning to the immutable tag keeps the comparison honest across commits.
// Resolution FAILS LOUDLY if the tag is missing: never silently fall back to HEAD.
export const BASELINE_TAG = 'v1.3.0';
let baselineCommitCache = null;
export function baselineRef() {
  if (baselineCommitCache) return baselineCommitCache;
  const result = spawnSync('git', ['rev-parse', `${BASELINE_TAG}^{commit}`], {
    cwd: REPO, encoding: 'utf8', maxBuffer: MAX_BUFFER,
  });
  const sha = String(result.stdout || '').trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `baseline tag ${BASELINE_TAG} does not resolve to a commit — refusing to fall back to HEAD `
      + '(a HEAD baseline silently self-compares once the upgrade is committed). '
      + `git rev-parse said: ${String(result.stderr || '').trim()}`,
    );
  }
  baselineCommitCache = sha;
  return sha;
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: REPO,
    encoding: null,
    maxBuffer: MAX_BUFFER,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return result;
}

export function gitShowHead(relativePath) {
  const ref = baselineRef();
  const result = runGit(['show', `${ref}:${relativePath}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`git show ${BASELINE_TAG}(${ref.slice(0, 7)}):${relativePath} failed: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function nullList(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function excludedSource(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    normalized.startsWith('.git/')
    || normalized.startsWith('node_modules/')
    || normalized.startsWith('docs/')
    || normalized.startsWith('plans/')
    || normalized.startsWith('test/')
    || normalized.startsWith('whitepaper/')
    || normalized.startsWith('eval/comparison/runs/')
  ) return true;
  if (/^eval\/[^/]+\/(?:out[^/]*|fixtures?)\//.test(normalized)) return true;
  return !SOURCE_EXTENSIONS.has(path.posix.extname(normalized));
}

function currentSourcePaths() {
  const result = runGit(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return nullList(result.stdout).filter(file => !excludedSource(file)).sort();
}

function headSourcePaths() {
  const result = runGit(['ls-tree', '-r', '--name-only', '-z', baselineRef()]);
  return nullList(result.stdout).filter(file => !excludedSource(file)).sort();
}

function collectMatches(source, pattern, callback) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) callback(match);
}

export function scanSourceEnvReads(source, relativePath = 'fixture.mjs') {
  const shell = /\.(?:sh|bash|zsh)$/.test(relativePath);
  // Raw-source scanning is deliberately conservative: a code-like flag mention in a new
  // comment or string may require registration, but it cannot hide an actual environment read.
  const code = String(source);
  const names = new Set();
  const unresolved = new Set();

  if (shell) {
    const assigned = new Set();
    collectMatches(
      code,
      /^\s*(?:export\s+|readonly\s+)?(FABLE_[A-Z_]+)\s*=/gm,
      match => assigned.add(match[1]),
    );
    collectMatches(code, /\$\{(FABLE_[A-Z_]+)(?=[:}])/g, match => names.add(match[1]));
    collectMatches(code, /\$(FABLE_[A-Z_]+)\b/g, match => names.add(match[1]));
    collectMatches(code, /\b(FABLE_[A-Z_]+)\b/g, (match) => {
      if (!assigned.has(match[1]) && !NON_ENV_FABLE_TOKENS.has(match[1])) names.add(match[1]);
    });
    for (const name of assigned) names.delete(name);
    return Object.freeze({
      names: Object.freeze([...names].sort()),
      unresolved: Object.freeze([]),
    });
  }

  const constants = new Map();
  // Match the actual process environment, not an arbitrary object property named
  // `env` (for example an MCP config's `entry.env[key]`). Flag-shaped literals are
  // still conservatively collected below, including aliased/loop-key access.
  const envBase = "\\b(?:process\\s*\\.\\s*env|process\\s*\\[\\s*(?:\"env\"|'env'|`env`)\\s*\\])";
  collectMatches(
    code,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])(FABLE_[A-Z_]+)\2/g,
    match => constants.set(match[1], match[3]),
  );
  collectMatches(
    code,
    new RegExp(`${envBase}\\s*(?:\\?\\.|\\.)\\s*(FABLE_[A-Z_]+)\\b`, 'g'),
    match => names.add(match[1]),
  );
  collectMatches(
    code,
    new RegExp(`${envBase}\\s*(?:\\?\\.)?\\s*\\[\\s*(['"\`])(FABLE_[A-Z_]+)\\1\\s*\\]`, 'g'),
    match => names.add(match[2]),
  );
  collectMatches(
    code,
    new RegExp(`${envBase}\\s*(?:\\?\\.)?\\s*\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\]`, 'g'),
    (match) => {
      if (constants.has(match[1])) names.add(constants.get(match[1]));
      else unresolved.add(match[0].replace(/\s+/g, ' '));
    },
  );
  collectMatches(
    code,
    new RegExp(`\\{([^{}]+)\\}\\s*=\\s*${envBase}\\b`, 'g'),
    (match) => {
      for (const field of match[1].split(',')) {
        const name = field.trim().split(/[:=]/, 1)[0].trim();
        if (/^FABLE_[A-Z_]+$/.test(name)) names.add(name);
      }
    },
  );
  collectMatches(
    code,
    new RegExp(`${envBase}\\s*(?:\\?\\.)?\\s*\\[\\s*([^\\]\\r\\n]+)\\s*\\]`, 'g'),
    (match) => {
      const expression = match[1].trim();
      if (/^(['"`])FABLE_[A-Z_]+\1$/.test(expression)) return;
      if (/^[A-Za-z_$][\w$]*$/.test(expression)) return;
      unresolved.add(match[0].replace(/\s+/g, ' '));
    },
  );

  // Conservatively bind flag-name string literals in files with unresolved dynamic env access.
  // This covers loop-key lookup patterns without requiring a JavaScript parser.
  if (unresolved.size) {
    collectMatches(code, /(['"`])(FABLE_[A-Z_]+)\1/g, match => names.add(match[2]));
  }
  // Fail closed across aliasing, parenthesized access, Reflect/Object helpers, and
  // future syntax: any flag-shaped token in executable source must be registered.
  collectMatches(code, /\b(FABLE_[A-Z_]+)\b/g, (match) => {
    if (!NON_ENV_FABLE_TOKENS.has(match[1])) names.add(match[1]);
  });

  return Object.freeze({
    names: Object.freeze([...names].sort()),
    unresolved: Object.freeze([...unresolved].sort()),
  });
}

function scanSources(entries) {
  const names = new Set();
  const unresolved = new Set();
  for (const entry of entries) {
    const result = scanSourceEnvReads(entry.source, entry.path);
    for (const name of result.names) names.add(name);
    for (const expression of result.unresolved) {
      unresolved.add(`${entry.path}:${expression}`);
    }
  }
  return Object.freeze({
    names: Object.freeze([...names].sort()),
    unresolved: Object.freeze([...unresolved].sort()),
  });
}

export function loadOptinManifest(file = OPTIN_MANIFEST_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function auditFlagSets({ current, baseline, manifestNames }) {
  const registered = new Set(manifestNames);
  const unregistered = current.names.filter(name => !registered.has(name));
  const baselineDynamic = new Set(baseline.unresolved);
  const newDynamicReads = current.unresolved.filter(item => !baselineDynamic.has(item));
  if (unregistered.length || newDynamicReads.length) {
    const parts = [];
    if (unregistered.length) parts.push(`UNREGISTERED flag(s): ${unregistered.join(', ')}`);
    if (newDynamicReads.length) parts.push(`UNRESOLVED dynamic env read(s): ${newDynamicReads.join(', ')}`);
    throw new Error(parts.join('; '));
  }
  return Object.freeze({
    currentFlags: current.names,
    baselineFlags: baseline.names,
    registeredFlags: Object.freeze([...registered].sort()),
    unresolvedBaselineReads: baseline.unresolved,
  });
}

export function auditRepositoryFlags(manifest = loadOptinManifest()) {
  const current = scanSources(currentSourcePaths().map(relativePath => ({
    path: relativePath,
    source: readFileSync(path.join(REPO, relativePath), 'utf8'),
  })));
  const baseline = scanSources(headSourcePaths().map(relativePath => ({
    path: relativePath,
    source: gitShowHead(relativePath).toString('utf8'),
  })));
  const audit = auditFlagSets({
    current,
    baseline,
    manifestNames: [
      ...manifest.baselineEnvReads,
      ...manifest.flags.map(entry => entry.name),
    ],
  });
  return Object.freeze({
    ...audit,
    registeredBaselineFlags: Object.freeze([...manifest.baselineEnvReads]),
    registeredUpgradeFlags: Object.freeze(manifest.flags.map(entry => entry.name)),
  });
}

function sourceExists(mode, relativePath) {
  if (mode === 'work') return existsSync(path.join(REPO, relativePath));
  return runGit(['cat-file', '-e', `${baselineRef()}:${relativePath}`], { allowFailure: true }).status === 0;
}

function sourceBytes(mode, relativePath) {
  return mode === 'head'
    ? gitShowHead(relativePath)
    : readFileSync(path.join(REPO, relativePath));
}

function writeSource(mode, root, relativePath) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, sourceBytes(mode, relativePath));
  if (SOURCE_EXTENSIONS.has(path.extname(relativePath))) chmodSync(destination, 0o755);
  return destination;
}

function sourceTreePaths(mode, relativeDirectory) {
  const args = mode === 'head'
    ? ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', relativeDirectory]
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', relativeDirectory];
  return nullList(runGit(args).stdout)
    .filter(relativePath => sourceExists(mode, relativePath))
    .sort();
}

function writeSourceTree(mode, root, relativeDirectory) {
  for (const relativePath of sourceTreePaths(mode, relativeDirectory)) {
    writeSource(mode, root, relativePath);
  }
}

function listCodexHooks(mode) {
  if (mode === 'head') {
    const result = runGit(['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'codex/hooks']);
    return nullList(result.stdout).filter(file => file.endsWith('.js')).sort();
  }
  return readdirSync(path.join(REPO, 'codex', 'hooks'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `codex/hooks/${entry.name}`)
    .sort();
}

function listSkillNames(mode) {
  if (mode === 'head') {
    const result = runGit(['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'claude-code/skills']);
    return nullList(result.stdout)
      .filter(file => file.endsWith('/SKILL.md'))
      .map(file => file.split('/')[2])
      .sort();
  }
  const root = path.join(REPO, 'claude-code', 'skills');
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(path.join(root, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

function cleanEnvironment(home, manifest, extra = {}) {
  const environment = {
    PATH: process.env.PATH || '',
    HOME: home,
    USERPROFILE: home,
    CI: '1',
    LANG: 'C',
    LC_ALL: 'C',
    TMPDIR: path.dirname(home),
  };
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) environment.SystemRoot = process.env.SystemRoot;
    if (process.env.WINDIR) environment.WINDIR = process.env.WINDIR;
  }
  for (const name of [
    ...manifest.baselineEnvReads,
    ...manifest.flags.map(entry => entry.name),
  ]) delete environment[name];
  if (manifest.snapshotExplicitOff === true) {
    for (const entry of manifest.flags) {
      if (entry.snapshotOffEnv !== null) environment[entry.name] = entry.snapshotOffEnv;
    }
  }
  return { ...environment, ...extra };
}

function normalizeString(value, replacements) {
  let normalized = String(value).replace(/\r\n?/g, '\n').replaceAll('\\', '/');
  for (const [needle, replacement] of replacements) {
    if (needle) normalized = normalized.split(needle.replaceAll('\\', '/')).join(replacement);
  }
  return normalized;
}

function normalizeValue(value, replacements) {
  if (typeof value === 'string') return normalizeString(value, replacements);
  if (Array.isArray(value)) return value.map(entry => normalizeValue(entry, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, normalizeValue(value[key], replacements)]),
    );
  }
  return value;
}

function commandResult(result, replacements) {
  return Object.freeze({
    status: typeof result.status === 'number' ? result.status : -1,
    signal: result.signal || null,
    stdout: normalizeString(result.stdout || '', replacements),
    stderr: normalizeString(result.stderr || '', replacements),
  });
}

function runNode(script, { args = [], input = '', env, cwd, replacements }) {
  return commandResult(spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    input,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  }), replacements);
}

function runNodeEval(source, { args = [], input = '', env, cwd, replacements }) {
  return commandResult(spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', source, '--', ...args],
    {
      cwd,
      env,
      input,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    },
  ), replacements);
}

function runBash(script, { args = [], input = '', env, cwd, replacements }) {
  if (process.platform === 'win32') {
    return Object.freeze({ status: 0, signal: null, stdout: '<SKIPPED:POSIX>', stderr: '' });
  }
  return commandResult(spawnSync('bash', [script, ...args], {
    cwd,
    env,
    input,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  }), replacements);
}

function prepareVariant(mode, root) {
  const sourceRoot = path.join(root, mode, 'source');
  const home = path.join(root, mode, 'home');
  const profile = path.join(home, '.claude', 'fable-profile');
  mkdirSync(profile, { recursive: true });
  writeFileSync(path.join(profile, 'compact.md'), 'SNAP_COMPACT\n');
  writeFileSync(path.join(profile, 'core.md'), 'SNAP_CORE\n');

  const fixedSources = [
    'install.mjs',
    'install.sh',
    'codex/AGENTS.fable.md',
    'claude-code/lib/mcp-remove.js',
    'claude-code/lib/mcp-env.js',
    'claude-code/lib/settings-merge.js',
    'claude-code/hooks/fable-subagent.js',
    'claude-code/hooks/fable-reinject.sh',
    'claude-code/hooks/fable-stopgate.js',
    'claude-code/hooks/fable-onboard.js',
    'claude-code/hooks/fable-model-check.js',
    'claude-code/hooks/fable-update-check.js',
    'claude-code/hooks/fable-readonly-verifier-gate.js',
    'claude-code/output-styles/Fable.header.md',
    'measurement/holdout.js',
    'measurement/runtime/assign.cjs',
    'measurement/runtime/holdout.cjs',
    'orchestration/lib/xverify-preset.mjs',
    'profiles/full.md',
    'profiles/compact.md',
    'profiles/core.md',
  ];
  for (const relativePath of fixedSources) {
    if (sourceExists(mode, relativePath)) writeSource(mode, sourceRoot, relativePath);
  }
  for (const relativeDirectory of [
    '.agents/skills',
    'claude-code/agents',
    'claude-code/skills',
    'codex/lib',
    'docs',
    'fusion',
    'mcp',
    'orchestration',
    'profiles',
    'skill/optin',
  ]) {
    writeSourceTree(mode, sourceRoot, relativeDirectory);
  }
  for (const directory of ['docs', 'fusion', 'mcp']) {
    mkdirSync(path.join(sourceRoot, directory), { recursive: true });
  }
  const codexHooks = listCodexHooks(mode);
  for (const relativePath of codexHooks) writeSource(mode, sourceRoot, relativePath);
  const claudeSkillNames = listSkillNames(mode);

  const reinject = path.join(sourceRoot, 'claude-code', 'hooks', 'fable-reinject.sh');
  if (existsSync(reinject)) {
    const original = readFileSync(reinject, 'utf8');
    const markerDirectory = path.join(root, mode, 'turn-markers').replaceAll('\\', '/');
    const markerLine = 'MARK_DIR="/tmp/fable-profile"';
    if (original.split(markerLine).length !== 2) {
      throw new Error(`${mode} fable-reinject.sh must contain exactly one ${markerLine}`);
    }
    writeFileSync(reinject, original.replace(markerLine, `MARK_DIR="${markerDirectory}"`));
    chmodSync(reinject, 0o755);
  }

  const realSource = realpathSync(sourceRoot);
  const realHome = realpathSync(home);
  const replacements = [
    [realSource, '<SOURCE>'],
    [sourceRoot, '<SOURCE>'],
    [realHome, '<HOME>'],
    [home, '<HOME>'],
    [realpathSync(root), '<TMP>'],
    [root, '<TMP>'],
  ].sort((left, right) => right[0].length - left[0].length);

  return Object.freeze({
    mode,
    sourceRoot,
    home,
    profile,
    codexHooks,
    claudeSkillNames,
    replacements,
  });
}

function hookEnvironment(variant, manifest, extra = {}) {
  return cleanEnvironment(variant.home, manifest, {
    FABLE_PROFILE_HOME: variant.profile,
    ...extra,
  });
}

function snapshotClaudeSubagent(variant, manifest) {
  const script = path.join(variant.sourceRoot, 'claude-code', 'hooks', 'fable-subagent.js');
  const execute = event => runNode(script, {
    input: JSON.stringify(event),
    env: hookEnvironment(variant, manifest),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  return Object.freeze({
    ordinary: execute({ session_id: 'audit-session', subagent_type: 'general-purpose' }),
    readonlyVerifierDefault: execute({
      session_id: 'audit-session',
      agent_type: 'fable-readonly-verifier',
      subagent_type: 'fable-readonly-verifier',
    }),
    legacyExempt: execute({ session_id: 'audit-session', subagent_type: 'red-team-validator' }),
    malformedFailOpen: runNode(script, {
      input: '{',
      env: hookEnvironment(variant, manifest),
      cwd: variant.sourceRoot,
      replacements: variant.replacements,
    }),
  });
}

function snapshotShellReinject(variant, manifest) {
  const script = path.join(variant.sourceRoot, 'claude-code', 'hooks', 'fable-reinject.sh');
  const transcript = path.join(variant.home, 'transcript.jsonl');
  const execute = event => runBash(script, {
    input: JSON.stringify(event),
    env: hookEnvironment(variant, manifest),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  writeFileSync(transcript, '{"model":"claude-opus"}\n');
  const first = execute({ session_id: 'audit-turns', transcript_path: transcript });
  const second = execute({ session_id: 'audit-turns', transcript_path: transcript });
  writeFileSync(transcript, '{"model":"claude-fable"}\n');
  const fableModel = execute({ session_id: 'audit-fable', transcript_path: transcript });
  const profileOff = runBash(script, {
    input: JSON.stringify({ session_id: 'audit-off', transcript_path: transcript }),
    env: hookEnvironment(variant, manifest, { FABLE_PROFILE: 'off' }),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  return Object.freeze({ first, second, fableModel, profileOff });
}

function snapshotCodexHooks(variant, manifest) {
  const expected = new Set([
    'codex/hooks/fable-reinject.js',
    'codex/hooks/fable-session.js',
    'codex/hooks/fable-subagent.js',
  ]);
  for (const relativePath of variant.codexHooks) {
    if (!expected.has(relativePath)) {
      throw new Error(`unprobed codex hook surface: ${relativePath}`);
    }
  }
  for (const relativePath of expected) {
    if (!variant.codexHooks.includes(relativePath)) {
      throw new Error(`missing codex hook surface: ${relativePath}`);
    }
  }
  const execute = (relativePath, event) => runNode(path.join(variant.sourceRoot, relativePath), {
    input: JSON.stringify(event),
    env: hookEnvironment(variant, manifest),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  return Object.freeze({
    files: variant.codexHooks,
    sessionStartup: execute('codex/hooks/fable-session.js', {
      source: 'startup',
      session_id: 'audit-session',
    }),
    sessionResume: execute('codex/hooks/fable-session.js', {
      source: 'resume',
      session_id: 'audit-session',
    }),
    reinject: execute('codex/hooks/fable-reinject.js', {
      session_id: 'audit-session',
    }),
    subagentOrdinary: execute('codex/hooks/fable-subagent.js', {
      session_id: 'audit-session',
      agent_type: 'general-purpose',
    }),
    subagentReadonlyVerifierDefault: execute('codex/hooks/fable-subagent.js', {
      session_id: 'audit-session',
      agent_type: 'fable-readonly-verifier',
    }),
    subagentLegacyExempt: execute('codex/hooks/fable-subagent.js', {
      session_id: 'audit-session',
      agent_type: 'red-team-validator',
    }),
  });
}

function snapshotStopGate(variant, manifest) {
  const script = path.join(variant.sourceRoot, 'claude-code', 'hooks', 'fable-stopgate.js');
  const transcript = path.join(variant.home, 'stop-transcript.jsonl');
  const execute = (text, extra = {}) => {
    writeFileSync(transcript, `${JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: text },
    })}\n`);
    return runNode(script, {
      input: JSON.stringify({ transcript_path: transcript, ...extra }),
      env: hookEnvironment(variant, manifest),
      cwd: variant.sourceRoot,
      replacements: variant.replacements,
    });
  };
  return Object.freeze({
    unsupportedCompletion: execute('Fixed. It works now.'),
    evidenceBacked: execute('Fixed — `npm test` passes.'),
    explicitlyUnverified: execute('Implemented, but not verified yet.'),
    alreadyActive: execute('Fixed. It works now.', { stop_hook_active: true }),
  });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listDirectory(file) {
  try {
    return readdirSync(file).sort();
  } catch {
    return [];
  }
}

function snapshotFileFootprint(root) {
  const entries = [];
  const visit = (directory, prefix = '') => {
    let children;
    try {
      children = readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const child of children) {
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) {
        visit(path.join(directory, child.name), relativePath);
      } else if (child.isSymbolicLink()) {
        entries.push(`symlink:${relativePath}`);
      } else if (child.isFile()) {
        // KNOWN SCOPE (G5.5 finding M-1, accepted non-blocking): this footprint compares the installed
        // file SET, not each file's bytes. Content-hashing every entry false-positives on volatile install
        // metadata (installed-version.json, fable-home, mode.json) and on the on-demand skill bodies/docs
        // this design deliberately lets evolve. The always-on profile text is therefore NOT byte-compared
        // here; it is covered by the separate fact that the upgrade does not modify `profiles/` at all
        // (verified: `git status --short profiles/ claude-code/output-styles/` is empty). Tightening this
        // to per-file digests needs a curated volatile-file exclusion list — deliberately deferred.
        entries.push(`file:${relativePath}`);
      } else {
        entries.push(`other:${relativePath}`);
      }
    }
  };
  visit(root);
  return Object.freeze(entries);
}

function snapshotSkillFiles(skillsRoot) {
  const snapshot = {};
  for (const name of listDirectory(skillsRoot)) {
    const skillFile = path.join(skillsRoot, name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const bytes = readFileSync(skillFile);
    snapshot[name] = Object.freeze({
      byteLength: bytes.length,
      base64: bytes.toString('base64'),
    });
  }
  return Object.freeze(snapshot);
}

function snapshotNodeInstallerOutput(variant, manifest) {
  const script = path.join(variant.sourceRoot, 'install.mjs');
  const result = runNode(script, {
    args: ['--dry-run', '--json'],
    env: cleanEnvironment(variant.home, manifest),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  let plan = null;
  try {
    plan = JSON.parse(result.stdout);
  } catch {
    plan = { parseError: result.stdout };
  }
  return Object.freeze({
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
    plan: normalizeValue(plan, variant.replacements),
    readonlyAgentListed: /fable-readonly-verifier\.md/.test(result.stdout),
    readonlyGateListed: /fable-readonly-verifier-gate\.js/.test(result.stdout),
  });
}

function snapshotNodeUninstallPlan(variant, manifest) {
  const script = path.join(variant.sourceRoot, 'install.mjs');
  const result = runNode(script, {
    args: ['--uninstall', '--dry-run', '--json'],
    env: cleanEnvironment(variant.home, manifest),
    cwd: variant.sourceRoot,
    replacements: variant.replacements,
  });
  let plan = null;
  try {
    plan = JSON.parse(result.stdout);
  } catch {
    plan = { parseError: result.stdout };
  }
  return Object.freeze({
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
    plan: normalizeValue(plan, variant.replacements),
  });
}

function snapshotNodeInstallerMutation(variant, manifest) {
  const home = path.join(path.dirname(variant.home), 'node-home');
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  const replacements = [
    [realpathSync(home), '<NODE_HOME>'],
    [home, '<NODE_HOME>'],
    ...variant.replacements,
  ].sort((left, right) => right[0].length - left[0].length);
  const result = runNode(path.join(variant.sourceRoot, 'install.mjs'), {
    args: ['--no-mcp'],
    env: cleanEnvironment(home, manifest, { FABLE_TS: 'snapshot' }),
    cwd: variant.sourceRoot,
    replacements,
  });
  const claude = path.join(home, '.claude');
  const installedMcpPath = path.join(claude, 'fable-profile', 'runtime', 'mcp', 'src', 'server.js');
  const installedMcp = existsSync(installedMcpPath)
    ? snapshotMcpServer(installedMcpPath, {
        env: cleanEnvironment(home, manifest, {
          FABLE_PROFILE_HOME: path.join(claude, 'fable-profile'),
          FABLE_TASTE: 'off',
        }),
        cwd: home,
        replacements,
      })
    : null;
  return Object.freeze({
    ...result,
    settings: normalizeValue(readJson(path.join(claude, 'settings.json')), replacements),
    hookFiles: listDirectory(path.join(claude, 'hooks')),
    agentFiles: listDirectory(path.join(claude, 'agents')),
    runtimeDirectories: listDirectory(path.join(claude, 'fable-profile', 'runtime')),
    fileFootprint: snapshotFileFootprint(claude),
    skillDirectories: listDirectory(path.join(claude, 'skills')),
    skillFiles: snapshotSkillFiles(path.join(claude, 'skills')),
    installedVersion: normalizeValue(
      readJson(path.join(claude, 'fable-profile', 'installed-version.json')),
      replacements,
    ),
    mode: readJson(path.join(claude, 'fable-profile', 'mode.json')),
    xverify: readJson(path.join(claude, 'fable-profile', 'xverify.json')),
    readonlyAgentInstalled: existsSync(path.join(claude, 'agents', 'fable-readonly-verifier.md')),
    readonlyGateInstalled: existsSync(path.join(claude, 'hooks', 'fable-readonly-verifier-gate.js')),
    installedMcp,
  });
}

function snapshotShellInstallerOutput(variant, manifest) {
  if (process.platform === 'win32') {
    return Object.freeze({
      status: 0,
      signal: null,
      stdout: '<SKIPPED:POSIX>',
      stderr: '',
      settings: null,
      hookFiles: [],
      agentFiles: [],
      runtimeDirectories: [],
      fileFootprint: [],
      installedVersion: null,
      mode: null,
      xverify: null,
      readonlyAgentInstalled: false,
      readonlyGateInstalled: false,
      installedMcp: null,
    });
  }
  const home = path.join(path.dirname(variant.home), 'shell-home');
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  const replacements = [
    [realpathSync(home), '<SHELL_HOME>'],
    [home, '<SHELL_HOME>'],
    ...variant.replacements,
  ].sort((left, right) => right[0].length - left[0].length);
  const result = runBash(path.join(variant.sourceRoot, 'install.sh'), {
    args: ['--no-mcp'],
    env: cleanEnvironment(home, manifest, { FABLE_TS: 'snapshot' }),
    cwd: variant.sourceRoot,
    replacements,
  });
  const claude = path.join(home, '.claude');
  const installedVersion = readJson(path.join(claude, 'fable-profile', 'installed-version.json'));
  const installedMcpPath = path.join(claude, 'fable-profile', 'runtime', 'mcp', 'src', 'server.js');
  const installedMcp = existsSync(installedMcpPath)
    ? snapshotMcpServer(installedMcpPath, {
        env: cleanEnvironment(home, manifest, {
          FABLE_PROFILE_HOME: path.join(claude, 'fable-profile'),
          FABLE_TASTE: 'off',
        }),
        cwd: home,
        replacements,
      })
    : null;
  return Object.freeze({
    ...result,
    settings: normalizeValue(readJson(path.join(claude, 'settings.json')), replacements),
    hookFiles: listDirectory(path.join(claude, 'hooks')),
    agentFiles: listDirectory(path.join(claude, 'agents')),
    runtimeDirectories: listDirectory(path.join(claude, 'fable-profile', 'runtime')),
    fileFootprint: snapshotFileFootprint(claude),
    installedVersion: normalizeValue(installedVersion, replacements),
    mode: readJson(path.join(claude, 'fable-profile', 'mode.json')),
    xverify: readJson(path.join(claude, 'fable-profile', 'xverify.json')),
    readonlyAgentInstalled: existsSync(path.join(claude, 'agents', 'fable-readonly-verifier.md')),
    readonlyGateInstalled: existsSync(path.join(claude, 'hooks', 'fable-readonly-verifier-gate.js')),
    installedMcp,
  });
}

function snapshotInstallerOutput(variant, manifest) {
  return Object.freeze({
    nodeDryRun: snapshotNodeInstallerOutput(variant, manifest),
    nodeUninstallDryRun: snapshotNodeUninstallPlan(variant, manifest),
    nodeInstall: snapshotNodeInstallerMutation(variant, manifest),
    shellInstall: snapshotShellInstallerOutput(variant, manifest),
  });
}

function snapshotMcpServer(script, { env, cwd, replacements }) {
  const execute = (request) => {
    const result = spawnSync(process.execPath, [script], {
      input: `${JSON.stringify(request)}\n`,
      env,
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    const stdout = result.stdout || '';
    return Object.freeze({
      status: typeof result.status === 'number' ? result.status : -1,
      signal: result.signal || null,
      stdoutByteLength: Buffer.byteLength(stdout),
      stdoutBase64: Buffer.from(stdout).toString('base64'),
      stderr: normalizeString(result.stderr || '', replacements),
    });
  };
  const criteriaBlock = [
    '<!-- fable-task-criteria:v1 -->',
    '- [task.audit] Preserve the HEAD default.',
    '<!-- /fable-task-criteria -->',
  ].join('\n');
  const callRequest = taskCriteria => ({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'fable_check',
      arguments: {
        text: 'Implemented and verified with npm test.',
        dod_id: 'code',
        task_criteria: taskCriteria,
      },
    },
  });
  return Object.freeze({
    toolsList: execute({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    normalFableCheck: execute(callRequest(undefined)),
    validHiddenTaskCriteria: execute(callRequest(criteriaBlock)),
    numericHiddenTaskCriteria: execute(callRequest(42)),
  });
}

function snapshotMcp(variant, manifest) {
  return snapshotMcpServer(
    path.join(variant.sourceRoot, 'mcp', 'src', 'server.js'),
    {
      env: cleanEnvironment(variant.home, manifest, {
        FABLE_PROFILE_HOME: variant.profile,
        FABLE_TASTE: 'off',
      }),
      cwd: variant.sourceRoot,
      replacements: variant.replacements,
    },
  );
}

function snapshotCodexSkillInstall(variant, manifest) {
  const home = path.join(path.dirname(variant.home), 'codex-skills-home');
  const codexHome = path.join(home, '.codex');
  mkdirSync(codexHome, { recursive: true });
  const replacements = [
    [realpathSync(home), '<CODEX_SKILLS_HOME>'],
    [home, '<CODEX_SKILLS_HOME>'],
    ...variant.replacements,
  ].sort((left, right) => right[0].length - left[0].length);
  const result = runNode(path.join(variant.sourceRoot, 'install.mjs'), {
    args: [
      '--codex-full',
      '--no-codex-agents',
      '--no-codex-hooks',
      '--no-codex-mcp',
    ],
    env: cleanEnvironment(home, manifest, { CODEX_HOME: codexHome }),
    cwd: variant.sourceRoot,
    replacements,
  });
  return Object.freeze({
    ...result,
    skillFiles: snapshotSkillFiles(path.join(home, '.agents', 'skills')),
    // Codex's command wrapper creates a random .codex/tmp/arg0 scratch tree before
    // the installer starts; it is not installer output and must not enter the set.
    fileFootprint: Object.freeze(snapshotFileFootprint(home).filter(
      entry => !/^[^:]+:\.codex\/tmp\//.test(entry),
    )),
  });
}

function snapshotSkills(variant, manifest, installerOutput) {
  return Object.freeze({
    shippedClaude: snapshotSkillFiles(
      path.join(variant.sourceRoot, 'claude-code', 'skills'),
    ),
    shippedCodex: snapshotSkillFiles(
      path.join(variant.sourceRoot, '.agents', 'skills'),
    ),
    installedClaude: installerOutput.nodeInstall.skillFiles,
    installedCodex: snapshotCodexSkillInstall(variant, manifest),
  });
}

async function recipeProbeMain() {
  const { readFileSync: read } = await import('node:fs');
  const [recipePath, recipeName] = process.argv.slice(1);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const source = read(recipePath, 'utf8')
    .replace(/^export\s+const\s+meta/m, 'const meta');
  const calls = [];
  const parallel = async (thunks) => {
    const settled = await Promise.allSettled(
      thunks.map(thunk => Promise.resolve().then(() => thunk())),
    );
    return settled.map(result => (
      result.status === 'fulfilled' ? result.value : null
    ));
  };
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, index) => {
    let value = item;
    for (const stage of stages) {
      try {
        value = await stage(value, item, index);
      } catch {
        return null;
      }
    }
    return value;
  }));
  const fixture = {
    'adversarial-verify': {
      args: {
        artifact: 'A substantial artifact for the HEAD dispatch audit. '.repeat(8),
        lenses: [
          'correctness',
          'security',
          'edge_cases',
          'consistency',
          'omission',
          'overclaim',
          'cost',
        ],
        crossModel: { provider: 'openrouter' },
      },
      respond(label) {
        if (label.startsWith('refute:')) {
          return {
            lens: label.slice('refute:'.length),
            refuted: true,
            confidence: 'high',
            defect_class: 'omission',
            findings: [
              { claim: 'fixture', evidence: 'fixture', severity: 'major' },
            ],
          };
        }
        if (label.startsWith('xverify:')) {
          return {
            lens: 'cross-model',
            refuted: false,
            confidence: 'low',
            defect_class: 'none',
            findings: [],
          };
        }
        return 'verification synthesis';
      },
    },
    'judge-panel': {
      args: {
        task: 'Produce one high-stakes audit artifact.',
        highStakes: true,
        angles: ['robust'],
      },
      respond(label) {
        if (label.startsWith('gen:')) return 'candidate';
        if (label.startsWith('judge:')) {
          return { candidate: 0, total: 9, per_criterion: [], verdict: 'good' };
        }
        return 'final';
      },
    },
    'divergent-explore': {
      args: {
        question: 'Explore distinct approaches to this substantial audit problem.',
        lenses: ['mvp-first'],
        maxRounds: 1,
        force: true,
      },
      respond(label) {
        return label.startsWith('diverge:')
          ? {
              lens: 'mvp-first',
              hypotheses: [{ title: 'A', approach: 'B', key_risk: 'C' }],
            }
          : 'synthesis';
      },
    },
    'decompose-first': {
      args: { task: 'Handle this atomic audit task.' },
      respond(label) {
        return label === 'plan'
          ? {
              split_axis: 'none',
              rationale: 'atomic',
              independent: true,
              subproblems: [{ title: 'only', goal: 'solve' }],
            }
          : 'direct';
      },
    },
    'pipeline-map': {
      args: { items: ['fixture'] },
      respond(label) {
        return label.startsWith('verify:')
          ? { ok: true, note: 'checked' }
          : { ok: true, output: label, note: 'stage' };
      },
    },
  }[recipeName];
  if (!fixture) throw new Error('unknown recipe fixture: ' + recipeName);
  const agent = async (_prompt, options = {}) => {
    calls.push({
      label: options.label || '',
      agentTypePresent: Object.hasOwn(options, 'agentType'),
      agentTypeUndefined: options.agentType === undefined,
      agentType: options.agentType === undefined ? null : options.agentType,
    });
    return fixture.respond(options.label || '');
  };
  const recipe = new AsyncFunction(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    source,
  );
  await recipe(agent, parallel, pipeline, () => {}, () => {}, fixture.args);
  // Snapshot every runtime call. Tests classify the advisory subset separately,
  // but no new or relabeled call may disappear before the HEAD comparison.
  process.stdout.write(JSON.stringify(calls) + '\n');
}

function snapshotRecipeDispatch(variant, manifest) {
  const source = '(' + recipeProbeMain.toString()
    + ')().catch(error => { console.error(error.stack || error.message); process.exit(1); });';
  const recipes = {};
  for (const recipeName of [
    'adversarial-verify',
    'decompose-first',
    'divergent-explore',
    'judge-panel',
    'pipeline-map',
  ]) {
    const result = runNodeEval(source, {
      args: [
        path.join(
          variant.sourceRoot,
          'orchestration',
          'recipes',
          `${recipeName}.mjs`,
        ),
        recipeName,
      ],
      env: cleanEnvironment(variant.home, manifest),
      cwd: variant.sourceRoot,
      replacements: variant.replacements,
    });
    let calls;
    try {
      calls = JSON.parse(result.stdout);
    } catch {
      calls = { parseError: result.stdout };
    }
    recipes[recipeName] = Object.freeze({
      status: result.status,
      signal: result.signal,
      stderr: result.stderr,
      calls,
    });
  }
  return Object.freeze(recipes);
}

function snapshotFile(file) {
  if (!existsSync(file)) return Object.freeze({ exists: false, base64: null });
  return Object.freeze({
    exists: true,
    base64: readFileSync(file).toString('base64'),
  });
}

function seedUnownedVerifierFiles(home) {
  const agent = path.join(
    home,
    '.claude',
    'agents',
    'fable-readonly-verifier.md',
  );
  const gate = path.join(
    home,
    '.claude',
    'hooks',
    'fable-readonly-verifier-gate.js',
  );
  mkdirSync(path.dirname(agent), { recursive: true });
  mkdirSync(path.dirname(gate), { recursive: true });
  writeFileSync(agent, 'UNOWNED_AGENT_SENTINEL\n');
  writeFileSync(gate, 'UNOWNED_GATE_SENTINEL\n');
  return Object.freeze({ agent, gate });
}

function snapshotOneUninstall(variant, manifest, kind) {
  const home = path.join(path.dirname(variant.home), `${kind}-uninstall-home`);
  const files = seedUnownedVerifierFiles(home);
  const replacements = [
    [realpathSync(home), `<${kind.toUpperCase()}_UNINSTALL_HOME>`],
    [home, `<${kind.toUpperCase()}_UNINSTALL_HOME>`],
    ...variant.replacements,
  ].sort((left, right) => right[0].length - left[0].length);
  const options = {
    args: ['--uninstall'],
    env: cleanEnvironment(home, manifest),
    cwd: variant.sourceRoot,
    replacements,
  };
  const result = kind === 'node'
    ? runNode(path.join(variant.sourceRoot, 'install.mjs'), options)
    : runBash(path.join(variant.sourceRoot, 'install.sh'), options);
  const agent = snapshotFile(files.agent);
  const gate = snapshotFile(files.gate);
  return Object.freeze({
    ...result,
    agent,
    gate,
    preserved: (
      agent.exists
      && gate.exists
      && Buffer.from(agent.base64, 'base64').toString('utf8')
        === 'UNOWNED_AGENT_SENTINEL\n'
      && Buffer.from(gate.base64, 'base64').toString('utf8')
        === 'UNOWNED_GATE_SENTINEL\n'
    ),
  });
}

function snapshotUninstallOwnership(variant, manifest) {
  return Object.freeze({
    node: snapshotOneUninstall(variant, manifest, 'node'),
    shell: snapshotOneUninstall(variant, manifest, 'shell'),
  });
}

function stageFakeClaude(binDirectory) {
  mkdirSync(binDirectory, { recursive: true });
  const source = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
if (argv[0] === '--version') { process.stdout.write('1.0.0\\n'); process.exit(0); }
const file = path.join(process.env.HOME, '.claude.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
config.mcpServers ||= {};
if (argv[0] === 'mcp' && argv[1] === 'list') {
  const names = Object.keys(config.mcpServers);
  process.stdout.write(names.join('\\n') + (names.length ? '\\n' : ''));
  process.exit(0);
}
if (argv[0] === 'mcp' && argv[1] === 'remove') {
  delete config.mcpServers[argv[2]];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\\n');
  process.exit(0);
}
if (argv[0] === 'mcp' && argv[1] === 'add') {
  const transport = argv.indexOf('--transport');
  const name = argv[transport + 2];
  const separator = argv.indexOf('--');
  const envIndex = argv.indexOf('--env');
  config.mcpServers[name] = {
    type: 'stdio',
    command: argv[separator + 1],
    args: argv.slice(separator + 2),
    ...(envIndex >= 0 ? { env: Object.fromEntries([argv[envIndex + 1].split('=')]) } : {}),
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\\n');
}
`;
  const js = path.join(binDirectory, 'claude-fake.js');
  writeFileSync(js, source);
  if (process.platform === 'win32') {
    writeFileSync(
      path.join(binDirectory, 'claude.cmd'),
      `@"${process.execPath}" "${js}" %*\r\n`,
    );
  } else {
    const executable = path.join(binDirectory, 'claude');
    writeFileSync(executable, source);
    chmodSync(executable, 0o755);
  }
}

function snapshotOneUpgradeTransition(variant, manifest, kind) {
  if (kind === 'shell' && process.platform === 'win32') {
    return Object.freeze({ skipped: true, reason: 'POSIX-only installer' });
  }
  const home = path.join(path.dirname(variant.home), `${kind}-transition-home`);
  const bin = path.join(home, 'bin');
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  stageFakeClaude(bin);
  const replacements = [
    [realpathSync(home), `<${kind.toUpperCase()}_TRANSITION_HOME>`],
    [home, `<${kind.toUpperCase()}_TRANSITION_HOME>`],
    ...variant.replacements,
  ].sort((left, right) => right[0].length - left[0].length);
  const args = [
    '--no-subagent',
    '--no-onboard',
    '--no-modelcheck',
    '--no-update-check',
  ];
  const baseExtra = { PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` };
  const onEnvironment = cleanEnvironment(home, manifest, {
    ...baseExtra,
    FABLE_ORCHESTRATION_PREFLIGHT: 'on',
    FABLE_READONLY_VERIFIER: 'on',
    FABLE_TASK_CRITERIA: 'on',
  });
  const offManifest = Object.freeze({ ...manifest, snapshotExplicitOff: true });
  const offEnvironment = cleanEnvironment(home, offManifest, baseExtra);
  const script = path.join(variant.sourceRoot, kind === 'node' ? 'install.mjs' : 'install.sh');
  const runner = kind === 'node' ? runNode : runBash;
  const onResult = runner(script, {
    args,
    env: onEnvironment,
    cwd: variant.sourceRoot,
    replacements,
  });
  const offResult = runner(script, {
    args,
    env: offEnvironment,
    cwd: variant.sourceRoot,
    replacements,
  });
  const claude = path.join(home, '.claude');
  const installedMcpPath = path.join(claude, 'fable-profile', 'runtime', 'mcp', 'src', 'server.js');
  const installedMcp = existsSync(installedMcpPath)
    ? snapshotMcpServer(installedMcpPath, {
        env: cleanEnvironment(home, offManifest, {
          FABLE_PROFILE_HOME: path.join(claude, 'fable-profile'),
          FABLE_TASTE: 'off',
        }),
        cwd: home,
        replacements,
      })
    : null;
  return Object.freeze({
    skipped: false,
    onStatus: onResult.status,
    offStatus: offResult.status,
    mcpConfig: normalizeValue(readJson(path.join(home, '.claude.json')), replacements),
    skillFiles: kind === 'node'
      ? snapshotSkillFiles(path.join(claude, 'skills'))
      : Object.freeze({}),
    fileFootprint: snapshotFileFootprint(claude),
    readonlyAgentInstalled: existsSync(path.join(claude, 'agents', 'fable-readonly-verifier.md')),
    readonlyGateInstalled: existsSync(path.join(claude, 'hooks', 'fable-readonly-verifier-gate.js')),
    installedMcp,
  });
}

function snapshotUpgradeTransitions(variant, manifest) {
  return Object.freeze({
    node: snapshotOneUpgradeTransition(variant, manifest, 'node'),
    shell: snapshotOneUpgradeTransition(variant, manifest, 'shell'),
  });
}

function snapshotVariant(variant, manifest) {
  const installerOutput = snapshotInstallerOutput(variant, manifest);
  return Object.freeze({
    claudeSubagent: snapshotClaudeSubagent(variant, manifest),
    shellReinject: snapshotShellReinject(variant, manifest),
    codexHooks: snapshotCodexHooks(variant, manifest),
    stopGate: snapshotStopGate(variant, manifest),
    installerOutput,
    mcp: snapshotMcp(variant, manifest),
    skills: snapshotSkills(variant, manifest, installerOutput),
    recipes: snapshotRecipeDispatch(variant, manifest),
    uninstallOwnership: snapshotUninstallOwnership(variant, manifest),
  });
}

// Charter #2 protects automatic/default-runtime behavior. On-demand skill bodies
// stay inert until a user invokes the capability, so their text is intentionally
// outside this byte-strict projection. The recursive install footprint below still
// locks the installed skill path set (and every other default-installed path) to HEAD.
function defaultRuntimeProjection(snapshot) {
  const nodeInstall = snapshot.installerOutput.nodeInstall;
  const shellInstall = snapshot.installerOutput.shellInstall;
  const codexInstall = snapshot.skills.installedCodex;
  return Object.freeze({
    hooks: Object.freeze({
      claudeSubagent: snapshot.claudeSubagent,
      shellReinject: snapshot.shellReinject,
      codexHooks: snapshot.codexHooks,
      stopGate: snapshot.stopGate,
      nodeSettings: nodeInstall.settings,
      shellSettings: shellInstall.settings,
    }),
    mcp: Object.freeze({
      source: snapshot.mcp,
      installedNode: nodeInstall.installedMcp,
      installedShell: shellInstall.installedMcp,
    }),
    installFileFootprint: Object.freeze({
      node: Object.freeze({
        status: nodeInstall.status,
        signal: nodeInstall.signal,
        paths: nodeInstall.fileFootprint,
      }),
      shell: Object.freeze({
        status: shellInstall.status,
        signal: shellInstall.signal,
        paths: shellInstall.fileFootprint,
      }),
      codex: Object.freeze({
        status: codexInstall.status,
        signal: codexInstall.signal,
        paths: codexInstall.fileFootprint,
      }),
    }),
    recipeDispatch: snapshot.recipes,
  });
}

function upgradeTransitionProjection(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot).map(([kind, installer]) => {
    if (installer.skipped) return [kind, installer];
    return [kind, Object.freeze({
      skipped: installer.skipped,
      onStatus: installer.onStatus,
      offStatus: installer.offStatus,
      mcpConfig: installer.mcpConfig,
      // Transition parity protects the installed set, not opt-in skill body bytes.
      skillPaths: Object.freeze(Object.keys(installer.skillFiles).sort()),
      fileFootprint: installer.fileFootprint,
      readonlyAgentInstalled: installer.readonlyAgentInstalled,
      readonlyGateInstalled: installer.readonlyGateInstalled,
      installedMcp: installer.installedMcp,
    })];
  })));
}

function differenceList(baseline, current, pointer = '$', output = []) {
  if (Object.is(baseline, current)) return output;
  if (
    baseline === null
    || current === null
    || typeof baseline !== 'object'
    || typeof current !== 'object'
  ) {
    output.push(Object.freeze({ path: pointer, baseline, current }));
    return output;
  }
  if (Array.isArray(baseline) || Array.isArray(current)) {
    if (!Array.isArray(baseline) || !Array.isArray(current)) {
      output.push(Object.freeze({ path: pointer, baseline, current }));
      return output;
    }
    const length = Math.max(baseline.length, current.length);
    for (let index = 0; index < length; index++) {
      differenceList(baseline[index], current[index], `${pointer}[${index}]`, output);
    }
    return output;
  }
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const key of [...keys].sort()) {
    differenceList(baseline[key], current[key], `${pointer}.${key}`, output);
  }
  return output;
}

export function captureBehavioralReport(manifest = loadOptinManifest()) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fable-v130-snapshot-'));
  try {
    const head = prepareVariant('head', root);
    const work = prepareVariant('work', root);
    const baseline = snapshotVariant(head, manifest);
    const current = snapshotVariant(work, manifest);
    const baselineRuntime = defaultRuntimeProjection(baseline);
    const currentRuntime = defaultRuntimeProjection(current);
    const diff = Object.freeze(differenceList(baselineRuntime, currentRuntime));
    const explicitRoot = path.join(root, 'explicit-off');
    const explicitManifest = Object.freeze({ ...manifest, snapshotExplicitOff: true });
    const explicitHead = prepareVariant('head', explicitRoot);
    const explicitWork = prepareVariant('work', explicitRoot);
    const explicitBaseline = snapshotVariant(explicitHead, explicitManifest);
    const explicitCurrent = snapshotVariant(explicitWork, explicitManifest);
    const explicitBaselineRuntime = defaultRuntimeProjection(explicitBaseline);
    const explicitCurrentRuntime = defaultRuntimeProjection(explicitCurrent);
    const explicitDiff = Object.freeze(differenceList(
      explicitBaselineRuntime,
      explicitCurrentRuntime,
    ));
    const transitionRoot = path.join(root, 'on-to-off');
    const transitionHead = prepareVariant('head', transitionRoot);
    const transitionWork = prepareVariant('work', transitionRoot);
    const transitionBaseline = snapshotUpgradeTransitions(transitionHead, manifest);
    const transitionCurrent = snapshotUpgradeTransitions(transitionWork, manifest);
    const transitionBaselineRuntime = upgradeTransitionProjection(transitionBaseline);
    const transitionCurrentRuntime = upgradeTransitionProjection(transitionCurrent);
    const transitionDiff = Object.freeze(differenceList(
      transitionBaselineRuntime,
      transitionCurrentRuntime,
    ));
    return Object.freeze({
      baselineRef: 'HEAD',
      upgradeFlagEnvironment: 'absent',
      surfaceList: DEFAULT_RUNTIME_SURFACES,
      baseline,
      current,
      baselineRuntime,
      currentRuntime,
      diff,
      explicitOff: Object.freeze({
        upgradeFlagEnvironment: 'manifest snapshotOffEnv values',
        baseline: explicitBaseline,
        current: explicitCurrent,
        baselineRuntime: explicitBaselineRuntime,
        currentRuntime: explicitCurrentRuntime,
        diff: explicitDiff,
      }),
      onToOff: Object.freeze({
        upgradeFlagEnvironment: 'on followed by manifest snapshotOffEnv values',
        baseline: transitionBaseline,
        current: transitionCurrent,
        baselineRuntime: transitionBaselineRuntime,
        currentRuntime: transitionCurrentRuntime,
        diff: transitionDiff,
      }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const manifest = loadOptinManifest();
  const flags = auditRepositoryFlags(manifest);
  const report = captureBehavioralReport(manifest);
  const differences = [
    ...report.diff,
    ...report.explicitOff.diff,
    ...report.onToOff.diff,
  ];
  const json = process.argv.includes('--json');
  if (json) {
    process.stdout.write(`${JSON.stringify({ flags, ...report }, null, 2)}\n`);
  } else {
    console.log(`opt-in flag scan: PASS (${flags.registeredUpgradeFlags.length} registered upgrade inputs)`);
    if (differences.length === 0) console.log('default runtime-surface diff vs v1.3.0: EMPTY (absent + explicit-off + on-to-off)');
    else {
      console.error(`default runtime-surface diff vs v1.3.0: ${differences.length} difference(s)`);
      for (const difference of differences) {
        console.error(`${difference.path}: HEAD=${JSON.stringify(difference.baseline)} WORK=${JSON.stringify(difference.current)}`);
      }
    }
  }
  process.exit(differences.length === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`opt-in audit snapshot: FAIL — ${error.message}`);
    process.exit(1);
  }
}
