// measurement-assignment-test.mjs — the load-bearing correctness + privacy core of the holdout measurement.
// Verifies: (1) assignArm is deterministic and race/order-invariant (every hook derives the SAME arm with no
// shared marker); (2) the salt+anonId privacy primitives are one-way and stable; (3) the Codex measure hook
// writes metadata-only rows — HMAC ids, never a raw session id/cwd/prompt/secret — gates on FABLE_MEASURE,
// keeps text-derived signals behind the opt-in tier, and logs BOTH arms. Zero network. Exit 0 = all pass.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { assignArm } = require(path.join(REPO, 'measurement/runtime/assign.cjs'));
const { readOrCreateSalt, anonId } = require(path.join(REPO, 'measurement/runtime/privacy.cjs'));
const HOOK = path.join(REPO, 'measurement/hooks/codex-measure.js');

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
// 6) the Codex injector hooks honor the holdout: off-arm suppresses, on-arm injects, no-campaign injects
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
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
