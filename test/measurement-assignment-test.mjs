// measurement-assignment-test.mjs — the load-bearing correctness + privacy core of the holdout measurement.
// Verifies: (1) assignArm is deterministic and race/order-invariant; (2) salt+anonId stay one-way; (3) Opus
// model ids take a condition-blind ~20% holdout path in both the standalone Claude hook and shared Codex
// runtime; (4) ledgers/markers use HMAC ids; (5) off arms are actually untreated; (6) FABLE_MEASURE unset
// performs zero filesystem writes. Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { assignArm, isOpusModel } = require(path.join(REPO, 'measurement/runtime/assign.cjs'));
const { holdoutOff } = require(path.join(REPO, 'measurement/runtime/holdout.cjs'));
const { readOrCreateSalt, anonId } = require(path.join(REPO, 'measurement/runtime/privacy.cjs'));
const HOOK = path.join(REPO, 'measurement/hooks/codex-measure.js');
const CLAUDE_HOLDOUT = path.join(REPO, 'measurement/holdout.js');
const COLLECT = path.join(REPO, 'measurement/collect.mjs');
const CLAUDE_SUBAGENT = path.join(REPO, 'claude-code/hooks/fable-subagent.js');
const CLAUDE_REINJECT = path.join(REPO, 'claude-code/hooks/fable-reinject.sh');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const SALT = Buffer.from('a'.repeat(64), 'hex');

// ---------------------------------------------------------------------------------------------------------
// 1) assignArm: deterministic + order/call invariant
{
  const args = { campaignId: 'c1', sessionId: 'sess-XYZ', salt: SALT, offPercent: 50 };
  const first = assignArm(args);
  let stable = true;
  for (let i = 0; i < 50; i++) if (assignArm(args) !== first) stable = false;
  t(stable, 'assignArm: same inputs → same arm across repeated/interleaved calls (race-invariant)');
  t(['on', 'off'].includes(first), 'assignArm: returns on|off');

  t(assignArm({ ...args, offPercent: 0 }) === 'on', 'offPercent=0 → on');
  t(assignArm({ ...args, offPercent: 100 }) === 'off', 'offPercent=100 → off');
  t(assignArm({ ...args, offPercent: NaN }) === assignArm({ ...args, offPercent: 50 }), 'offPercent NaN falls back to 50 (no accidental all-on/off)');

  // different campaign id can change the arm for the same session (independent randomization per campaign)
  let off = 0, total = 600;
  for (let i = 0; i < total; i++) if (assignArm({ campaignId: 'big', sessionId: 's' + i, salt: SALT, offPercent: 50 }) === 'off') off++;
  t(off > total * 0.4 && off < total * 0.6, `assignArm: ~50/50 split over ${total} sessions (got ${off} off)`);

  const opusIds = ['claude-opus-4-8', 'claude-3-opus-20240229', 'anthropic:claude-opus-4.1'];
  const nonOpusIds = [
    'claude-sonnet-4-8', 'claude-haiku-4-5', 'gpt-5.5-codex',
    'openai-opus', 'gpt-opus', 'not-opus', 'opus-compatible-test', '', 'unknown',
  ];
  t(opusIds.every(isOpusModel), 'model recognition: Claude/Opus ids are recognized');
  t(nonOpusIds.every(id => !isOpusModel(id)), 'model recognition: non-Claude Opus aliases and Sonnet/Haiku/GPT stay non-Opus');

  const blindArgs = { campaignId: 'opus-campaign', sessionId: 'same-session', salt: SALT, offPercent: 20 };
  const modelBlindArms = opusIds.map(model => assignArm({ ...blindArgs, model }));
  t(new Set(modelBlindArms).size === 1, 'Opus assignment is condition-blind: model alias never enters the arm hash');

  let opusOff = 0;
  const opusTotal = 1000;
  for (let i = 0; i < opusTotal; i++) {
    if (assignArm({ campaignId: 'cmp', sessionId: 'opus-dist-' + i, salt: SALT, offPercent: 20 }) === 'off') opusOff++;
  }
  t(opusOff > opusTotal * 0.15 && opusOff < opusTotal * 0.25, `Opus allocation: ~20% untreated over ${opusTotal} sessions (got ${opusOff} off)`);
}

// ---------------------------------------------------------------------------------------------------------
// 2) privacy primitives: salt 0600 + stable; anonId one-way + stable + prefixed
{
  const dir = mkdtempSync(path.join(tmpdir(), 'fable-salt-'));
  const s1 = readOrCreateSalt(dir);
  const s2 = readOrCreateSalt(dir);
  t(Buffer.isBuffer(s1) && s1.length === 32, 'salt: 32 random bytes');
  t(Buffer.compare(s1, s2) === 0, 'salt: stable across calls (same file reused)');
  const mode = statSync(path.join(dir, 'measurement-salt')).mode & 0o777;
  t(mode === 0o600, `salt file is 0600 (got ${mode.toString(8)})`);

  const raw = 'super-secret-session-id-1234';
  const id = anonId('s', raw, s1);
  t(/^s_[0-9a-f]{24}$/.test(id), 'anonId: prefixed 24-hex digest');
  t(id === anonId('s', raw, s1), 'anonId: deterministic for same (value, salt)');
  t(!id.includes(raw) && id !== raw, 'anonId: raw value not recoverable from the id');
  t(anonId('s', raw, s1) !== anonId('s', raw, readOrCreateSalt(mkdtempSync(path.join(tmpdir(), 'fable-salt2-')))), 'anonId: different salt → different id');
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// helper to run the Codex measure hook with an event on stdin
function runHook(event, env) {
  const home = env.FABLE_MEASURE_HOME;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    env: { PATH: process.env.PATH, FABLE_MEASURE: 'on', FABLE_MEASURE_CAMPAIGN: 'cmp', ...env },
    encoding: 'utf8',
  });
  const dir = path.join(home, 'events');
  let rows = [];
  if (existsSync(dir)) for (const f of readdirSync(dir)) rows.push(...readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse));
  return { r, rows, ledgerText: existsSync(dir) ? readdirSync(dir).map(f => readFileSync(path.join(dir, f), 'utf8')).join('') : '' };
}
// The logger reads (never creates) the campaign salt — the campaign `start` seeds it. Mirror that here.
const newHome = () => { const h = mkdtempSync(path.join(tmpdir(), 'fable-measure-')); writeFileSync(path.join(h, 'measurement-salt'), SALT, { mode: 0o600 }); return h; };

// ---------------------------------------------------------------------------------------------------------
// 3) measure hook: metadata-only row, HMAC ids, no raw session/cwd/prompt/secret
{
  const home = newHome();
  const SECRET = 'sk-LEAK-SECRET-9999';
  const ev = { session_id: 'real-session-id-abc', cwd: '/Users/secret/' + SECRET, hook_event_name: 'UserPromptSubmit', prompt: 'actually that is wrong, undo it ' + SECRET, model: 'gpt-5.5-codex', permission_mode: 'default' };
  const { r, rows, ledgerText } = runHook(ev, { FABLE_MEASURE_HOME: home });
  t(r.status === 0 && (r.stdout || '') === '', 'measure hook: exits 0 with no stdout');
  t(rows.length === 1, 'measure hook: wrote exactly one event row');
  const row = rows[0] || {};
  t(/^s_[0-9a-f]{24}$/.test(row.session_key) && row.session_key !== 'real-session-id-abc', 'row: session_key is HMAC, not the raw session id');
  t(/^p_[0-9a-f]{24}$/.test(row.project_key), 'row: project_key is HMAC of cwd');
  t(!ledgerText.includes('real-session-id-abc'), 'privacy: raw session id never appears in the ledger');
  t(!ledgerText.includes('/Users/secret'), 'privacy: raw cwd never appears in the ledger');
  t(!ledgerText.includes(SECRET), 'privacy: a secret planted in prompt+cwd never appears in the ledger');
  t(!('prompt' in row) && !('cwd' in row) && !('session_id' in row), 'row: no raw prompt/cwd/session_id fields');
  t(['on', 'off'].includes(row.arm) && row.metrics && row.metrics.user_turn === 1, 'row: tagged with an arm + user_turn metric');
  t(row.model === 'gpt-5.5-codex', 'non-Opus model metadata behavior is unchanged');
  rmSync(home, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 4) text-derived signals are gated behind the opt-in tier (boolean only, still no raw text)
{
  const prompt = 'no, that is wrong, revert that';
  const off = newHome();
  const a = runHook({ session_id: 's1', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt }, { FABLE_MEASURE_HOME: off });
  t(!('reinstruction' in (a.rows[0]?.metrics || {})), 'text-signals OFF: no reinstruction flag recorded');
  rmSync(off, { recursive: true, force: true });

  const on = newHome();
  const b = runHook({ session_id: 's1', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt }, { FABLE_MEASURE_HOME: on, FABLE_MEASURE_TEXT_SIGNALS: 'on' });
  t(b.rows[0]?.metrics?.reinstruction === 1, 'text-signals ON: reinstruction recorded as a boolean 1');
  t(!b.ledgerText.includes('revert that'), 'text-signals ON: the source prompt text is still NOT stored');
  rmSync(on, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 5) gating + both-arms logging + per-event metrics
{
  // FABLE_MEASURE not on → no-op
  const home = newHome();
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart' }), env: { PATH: process.env.PATH, FABLE_MEASURE: 'off', FABLE_MEASURE_HOME: home, FABLE_MEASURE_CAMPAIGN: 'cmp' }, encoding: 'utf8' });
  t(r.status === 0 && !existsSync(path.join(home, 'events')), 'FABLE_MEASURE=off: hook is a no-op (no ledger)');
  rmSync(home, { recursive: true, force: true });

  // PostToolUse edit + failure metadata (no tool_input read)
  const h2 = newHome();
  const e = runHook({ session_id: 'sx', cwd: '/x', hook_event_name: 'PostToolUse', tool_name: 'Edit', exit_code: 0 }, { FABLE_MEASURE_HOME: h2 });
  t(e.rows[0]?.metrics?.tool_call === 1 && e.rows[0]?.metrics?.edit === 1, 'PostToolUse(Edit): tool_call + edit recorded');
  const e2 = runHook({ session_id: 'sx', cwd: '/x', hook_event_name: 'PostToolUse', tool_name: 'Bash', exit_code: 2 }, { FABLE_MEASURE_HOME: h2 });
  const failedRow = e2.rows.find(r => r.metrics && r.metrics.tool_failed === 1);
  t(failedRow && failedRow.metrics.shell_call === 1, 'PostToolUse(Bash exit 2): shell_call + tool_failed from metadata');
  rmSync(h2, { recursive: true, force: true });

  // both arms get logged, and the hook's arm tag MATCHES assignArm() (the same fn the injectors use).
  // Deterministic: pre-seed a known salt, pick one session that lands 'on' and one that lands 'off'.
  const h3 = newHome();
  writeFileSync(path.join(h3, 'measurement-salt'), SALT, { mode: 0o600 });
  const armOf = sid => assignArm({ campaignId: 'cmp', sessionId: sid, salt: SALT, offPercent: 50 });
  let onSid = null, offSid = null;
  for (let i = 0; i < 200 && !(onSid && offSid); i++) { const s = 'sess' + i; if (armOf(s) === 'on') onSid ||= s; else offSid ||= s; }
  const rowFor = sid => runHook({ session_id: sid, cwd: '/x', hook_event_name: 'SessionStart' }, { FABLE_MEASURE_HOME: h3 })
    .rows.find(r => r.session_key === anonId('s', sid, SALT));
  t(rowFor(onSid)?.arm === 'on', 'measure hook: on-arm session tagged on (matches assignArm)');
  t(rowFor(offSid)?.arm === 'off', 'measure hook: off-arm session tagged off (matches assignArm)');
  rmSync(h3, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 6) Opus sessions: recognized + deterministic 20% HMAC arms, model-blind, private, and context-invisible
{
  const home = newHome();
  const armOf = sid => assignArm({ campaignId: 'cmp', sessionId: sid, salt: SALT, offPercent: 20 });
  let onSid = null, offSid = null;
  for (let i = 0; i < 200 && !(onSid && offSid); i++) {
    const sid = 'opus' + i;
    if (armOf(sid) === 'on') onSid ||= sid;
    else offSid ||= sid;
  }
  const MODEL_SECRET = 'claude-opus-4-8-secret-model-suffix';
  const RAW_CWD = '/private/opus-project';
  const RAW_PROMPT = 'secret prompt content must stay out of band';
  const env = { FABLE_MEASURE_HOME: home, FABLE_MEASURE_OFF_PCT: '20' };
  const eventFor = (sid, model, hookEventName) => ({
    session_id: sid,
    cwd: RAW_CWD,
    hook_event_name: hookEventName,
    prompt: RAW_PROMPT,
    model,
  });

  const onRun = runHook(eventFor(onSid, MODEL_SECRET, 'SessionStart'), env);
  const offRun = runHook(eventFor(offSid, 'anthropic:claude-3-opus-20240229', 'SessionStart'), env);
  const onKey = anonId('s', onSid, SALT);
  const offKey = anonId('s', offSid, SALT);
  const onRow = onRun.rows.find(row => row.session_key === onKey);
  const offRow = offRun.rows.find(row => row.session_key === offKey);

  t(onSid && offSid && onRow?.arm === 'on' && offRow?.arm === 'off', 'Opus hook: seeded 20% campaign proves both on and off arms');
  t(onRow?.arm === armOf(onSid) && offRow?.arm === armOf(offSid), 'Opus hook: logged arms exactly match assignArm(session hash)');
  t(onRow?.model === 'claude-opus' && offRow?.model === 'claude-opus', 'Opus hook: Claude/Opus ids are recognized and canonicalized');
  t(/^s_[0-9a-f]{24}$/.test(onRow?.session_key || '') && /^p_[0-9a-f]{24}$/.test(onRow?.project_key || ''), 'Opus hook: session/project identifiers remain HMAC-only');
  t(onRun.r.status === 0 && offRun.r.status === 0 && onRun.r.stdout === '' && offRun.r.stdout === ''
    && !onRun.r.stdout.includes('additionalContext') && !offRun.r.stdout.includes('additionalContext'),
  'Opus hook: exits 0, emits no stdout, and never surfaces the arm as additionalContext');

  const modelLessEvent = eventFor(onSid, 'claude-opus-4-8', 'UserPromptSubmit');
  delete modelLessEvent.model;
  const aliasRun = runHook(modelLessEvent, env);
  const aliasRows = aliasRun.rows.filter(row => row.session_key === onKey);
  t(aliasRows.length >= 2 && aliasRows.every(row => row.arm === 'on'), 'Opus hook: same session stays on when later events omit model metadata');

  const opusLedger = aliasRun.ledgerText;
  t(!opusLedger.includes(onSid) && !opusLedger.includes(offSid) && !opusLedger.includes(RAW_CWD)
    && !opusLedger.includes(RAW_PROMPT) && !opusLedger.includes(MODEL_SECRET),
  'Opus privacy: raw session/cwd/prompt/model-derived content never enters the ledger');
  rmSync(home, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 7) installed-style Claude SessionStart hook: Opus HMAC assignment drives an actually untreated off arm
{
  const root = mkdtempSync(path.join(tmpdir(), 'fable-claude-opus-'));
  const hookDir = path.join(root, 'hooks');
  const installedHoldout = path.join(hookDir, 'fable-holdout.js');
  const userHome = path.join(root, 'user-home');
  const profileDir = path.join(userHome, '.claude', 'fable-profile');
  const measureHome = path.join(root, 'measure');
  mkdirSync(hookDir);
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(measureHome);
  copyFileSync(CLAUDE_HOLDOUT, installedHoldout); // no ./runtime beside it: exercises the standalone fallback
  writeFileSync(path.join(profileDir, 'compact.md'), 'compact-profile');
  writeFileSync(path.join(profileDir, 'core.md'), 'core-profile');
  writeFileSync(path.join(measureHome, 'measurement-salt'), SALT, { mode: 0o600 });

  const armOf = sid => assignArm({ campaignId: 'cmp', sessionId: sid, salt: SALT, offPercent: 20 });
  let onSid = null, offSid = null;
  for (let i = 0; i < 200 && !(onSid && offSid); i++) {
    const sid = 'claude-opus-session-' + i;
    if (armOf(sid) === 'on') onSid ||= sid;
    else offSid ||= sid;
  }
  const env = {
    PATH: process.env.PATH,
    HOME: userHome,
    USERPROFILE: userHome,
    FABLE_MEASURE: 'on',
    FABLE_MEASURE_HOME: measureHome,
    FABLE_MEASURE_CAMPAIGN: 'cmp',
  };
  const MODEL_SECRET = 'claude-opus-4-8-private-model-suffix';
  const RAW_CWD = '/private/claude-opus-project';
  const RAW_PROMPT = 'private Opus prompt must not be stored';
  const eventFor = (sid, model = MODEL_SECRET) => ({
    session_id: sid,
    cwd: RAW_CWD,
    prompt: RAW_PROMPT,
    hook_event_name: 'SessionStart',
    model,
  });
  const runInstalledHoldout = event => spawnSync(process.execPath, [installedHoldout], {
    input: JSON.stringify(event),
    env,
    encoding: 'utf8',
  });

  const onRun = runInstalledHoldout(eventFor(onSid));
  const offRun = runInstalledHoldout(eventFor(offSid, 'anthropic:claude-3-opus-20240229'));
  const rows = readFileSync(path.join(measureHome, 'measure-ledger.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(JSON.parse);
  const onKey = anonId('s', onSid, SALT);
  const offKey = anonId('s', offSid, SALT);
  const onRow = rows.find(row => row.session_key === onKey);
  const offRow = rows.find(row => row.session_key === offKey);
  const ledgerText = JSON.stringify(rows);

  t(onRun.status === 0 && offRun.status === 0 && onRun.stdout === '' && offRun.stdout === '', 'Claude Opus holdout: standalone installed hook exits 0 with no stdout');
  t(onRow?.arm === 'on' && offRow?.arm === 'off' && onRow.arm === armOf(onSid) && offRow.arm === armOf(offSid), 'Claude Opus holdout: seeded session hash proves deterministic on and off arms');
  t(onRow?.model === 'claude-opus' && offRow?.model === 'claude-opus'
    && /^s_[0-9a-f]{24}$/.test(offRow?.session_key || '') && /^p_[0-9a-f]{24}$/.test(offRow?.project_key || ''),
  'Claude Opus holdout: recognition is canonical and identifiers are HMAC-only');
  t(!ledgerText.includes(onSid) && !ledgerText.includes(offSid) && !ledgerText.includes(RAW_CWD)
    && !ledgerText.includes(RAW_PROMPT) && !ledgerText.includes(MODEL_SECRET),
  'Claude Opus privacy: raw session/cwd/prompt/model-derived content never enters the ledger');
  t(existsSync(path.join(measureHome, 'holdout', `${offKey}.off`))
    && !existsSync(path.join(measureHome, 'holdout', `${onKey}.off`))
    && !existsSync(path.join(measureHome, 'holdout', `${offSid}.off`)),
  'Claude Opus holdout: off marker is HMAC-named and on has no marker');

  const runClaudeSubagent = event => spawnSync(process.execPath, [CLAUDE_SUBAGENT], {
    input: JSON.stringify({ ...event, agent_type: 'coder' }),
    env,
    encoding: 'utf8',
  });
  const subOff = runClaudeSubagent(eventFor(offSid, 'claude-sonnet-4-8'));
  const subOn = runClaudeSubagent(eventFor(onSid));
  t(subOff.stdout === '' && subOn.stdout.includes('additionalContext'), 'Claude Opus subagent: parent off arm stays untreated even for a Sonnet subagent');

  const runClaudeReinject = event => spawnSync('bash', [CLAUDE_REINJECT], {
    input: JSON.stringify(event),
    env,
    encoding: 'utf8',
  });
  const reinjectOff = runClaudeReinject({ ...eventFor(offSid), model: undefined });
  const reinjectOn = runClaudeReinject(eventFor(onSid));
  t(reinjectOff.status === 0 && reinjectOff.stdout === '', 'Claude Opus reinject: off arm is untreated');
  t(reinjectOn.status === 0 && /(?:compact|core)-profile/.test(reinjectOn.stdout), 'Claude Opus reinject: on arm still injects');
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 8) post-hoc Claude collector can join an HMAC ledger row without re-persisting the raw session id
{
  const root = mkdtempSync(path.join(tmpdir(), 'fable-opus-collect-'));
  const profileDir = path.join(root, '.claude', 'fable-profile');
  const projectDir = path.join(root, '.claude', 'projects', 'p');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(profileDir, 'measurement-salt'), SALT, { mode: 0o600 });
  const rawSid = 'collector-private-opus-session';
  const sessionKey = anonId('s', rawSid, SALT);
  writeFileSync(path.join(profileDir, 'measure-ledger.jsonl'), JSON.stringify({ session_key: sessionKey, arm: 'off' }) + '\n');
  writeFileSync(path.join(projectDir, `${rawSid}.jsonl`), [
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'hello' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: 'done' } }),
  ].join('\n') + '\n');
  const collected = spawnSync(process.execPath, [COLLECT], {
    env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root },
    encoding: 'utf8',
  });
  const outcomeText = readFileSync(path.join(profileDir, 'measure-outcomes.jsonl'), 'utf8');
  const outcome = JSON.parse(outcomeText.trim());
  t(collected.status === 0 && outcome.session_key === sessionKey && outcome.transcript === true, 'Opus collector: HMAC ledger row joins to the local transcript');
  t(!('session_id' in outcome) && !outcomeText.includes(rawSid), 'Opus collector privacy: joined outcome does not re-persist the raw session id');
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 9) mandatory inert direction: unset measurement writes nothing; profile-off disables before any write
{
  const root = mkdtempSync(path.join(tmpdir(), 'fable-opus-inert-'));
  const inertEnv = {
    PATH: process.env.PATH,
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'),
    FABLE_MEASURE_HOME: path.join(root, 'measure'),
    FABLE_MEASURE_CAMPAIGN: 'cmp',
  };
  const event = { session_id: 'opus-inert', cwd: '/must-not-write', hook_event_name: 'SessionStart', model: 'claude-opus-4-8' };
  const codex = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), env: inertEnv, encoding: 'utf8' });
  const claude = spawnSync(process.execPath, [CLAUDE_HOLDOUT], { input: JSON.stringify(event), env: inertEnv, encoding: 'utf8' });
  t(codex.status === 0 && claude.status === 0 && codex.stdout === '' && claude.stdout === '', 'FABLE_MEASURE unset: Opus assignment hooks exit 0 with no stdout');
  t(readdirSync(root).length === 0, 'FABLE_MEASURE unset: Opus assignment hooks perform zero filesystem writes');
  rmSync(root, { recursive: true, force: true });

  const profileRoot = mkdtempSync(path.join(tmpdir(), 'fable-opus-profile-off-'));
  const measureHome = path.join(profileRoot, 'measure');
  mkdirSync(measureHome);
  writeFileSync(path.join(measureHome, 'measurement-salt'), SALT, { mode: 0o600 });
  const profileOffEnv = {
    PATH: process.env.PATH,
    HOME: path.join(profileRoot, 'home'),
    USERPROFILE: path.join(profileRoot, 'home'),
    FABLE_MEASURE: 'on',
    FABLE_PROFILE: 'off',
    FABLE_MEASURE_HOME: measureHome,
    FABLE_MEASURE_CAMPAIGN: 'cmp',
    FABLE_MEASURE_OFF_PCT: '20',
  };
  const profileCodex = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), env: profileOffEnv, encoding: 'utf8' });
  const profileClaude = spawnSync(process.execPath, [CLAUDE_HOLDOUT], { input: JSON.stringify(event), env: profileOffEnv, encoding: 'utf8' });
  t(profileCodex.status === 0 && profileClaude.status === 0 && profileCodex.stdout === '' && profileClaude.stdout === '', 'FABLE_PROFILE=off: Opus hooks exit 0 with no stdout');
  t(readdirSync(measureHome).join(',') === 'measurement-salt' && !existsSync(path.join(measureHome, 'events'))
    && readdirSync(profileRoot).join(',') === 'measure',
  'FABLE_PROFILE=off: seeded measurement home receives zero additional filesystem writes');
  t(holdoutOff({ env: profileOffEnv, sessionId: 'opus1' }) === false, 'FABLE_PROFILE=off: shared injector guard is disabled');
  rmSync(profileRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 10) the Codex injector hooks honor both legacy and default-20% Opus holdouts
{
  const home = newHome();
  writeFileSync(path.join(home, 'measurement-salt'), SALT, { mode: 0o600 });
  const armOf = sid => assignArm({ campaignId: 'cmp', sessionId: sid, salt: SALT, offPercent: 50 });
  let onSid = null, offSid = null;
  for (let i = 0; i < 200 && !(onSid && offSid); i++) { const s = 'hk' + i; if (armOf(s) === 'on') onSid ||= s; else offSid ||= s; }
  const campaign = { FABLE_MEASURE: 'on', FABLE_MEASURE_HOME: home, FABLE_MEASURE_CAMPAIGN: 'cmp' };
  const runHookFile = (rel, event, env) => spawnSync(process.execPath, [path.join(REPO, 'codex', 'hooks', rel)], { input: JSON.stringify(event), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

  const offR = runHookFile('fable-session.js', { source: 'startup', session_id: offSid }, campaign);
  t(offR.status === 0 && (offR.stdout || '') === '', 'session hook: off-arm suppresses injection (no stdout)');
  const onR = runHookFile('fable-session.js', { source: 'startup', session_id: onSid }, campaign);
  t(onR.status === 0 && onR.stdout.includes('additionalContext'), 'session hook: on-arm still injects');
  const noCamp = runHookFile('fable-session.js', { source: 'startup', session_id: offSid }, {});
  t(noCamp.stdout.includes('additionalContext'), 'session hook: no campaign → injects (guard fail-open)');

  const subOff = runHookFile('fable-subagent.js', { session_id: offSid, agent_type: 'coder' }, campaign);
  t((subOff.stdout || '') === '', 'subagent hook: off-arm suppresses injection');
  const subOn = runHookFile('fable-subagent.js', { session_id: onSid, agent_type: 'coder' }, campaign);
  t(subOn.stdout.includes('additionalContext'), 'subagent hook: on-arm still injects');
  const rjOff = runHookFile('fable-reinject.js', { session_id: offSid }, campaign);
  t((rjOff.stdout || '') === '', 'reinject hook: off-arm suppresses injection');

  const opusArmOf = sid => assignArm({ campaignId: 'cmp', sessionId: sid, salt: SALT, offPercent: 20 });
  let opusOnSid = null, opusOffSid = null;
  for (let i = 0; i < 200 && !(opusOnSid && opusOffSid); i++) {
    const sid = 'codex-opus-' + i;
    if (opusArmOf(sid) === 'on') opusOnSid ||= sid;
    else opusOffSid ||= sid;
  }
  const opusCampaign = { ...campaign, FABLE_MEASURE_OFF_PCT: '20' };
  const opusEvent = sid => ({ source: 'startup', session_id: sid, model: 'claude-opus-4-8' });
  const opusSessionOff = runHookFile('fable-session.js', opusEvent(opusOffSid), opusCampaign);
  const opusSessionOn = runHookFile('fable-session.js', opusEvent(opusOnSid), opusCampaign);
  t(opusSessionOff.stdout === '' && opusSessionOn.stdout.includes('additionalContext'), 'Codex Opus session hook: explicit-20% off is untreated; on injects');
  const opusSubOff = runHookFile('fable-subagent.js', { session_id: opusOffSid, model: 'claude-sonnet-4-8', agent_type: 'coder' }, opusCampaign);
  const opusSubOn = runHookFile('fable-subagent.js', { ...opusEvent(opusOnSid), agent_type: 'coder' }, opusCampaign);
  t(opusSubOff.stdout === '' && opusSubOn.stdout.includes('additionalContext'), 'Codex Opus subagent hook: explicit-20% parent off arm survives a different subagent model');
  const opusReinjectOff = runHookFile('fable-reinject.js', { session_id: opusOffSid }, opusCampaign);
  const opusReinjectOn = runHookFile('fable-reinject.js', opusEvent(opusOnSid), opusCampaign);
  t(opusReinjectOff.stdout === '' && opusReinjectOn.stdout.includes('additionalContext'), 'Codex Opus reinject hook: explicit-20% arm survives missing model metadata');
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
