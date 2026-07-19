#!/usr/bin/env node
'use strict';
// measurement/hooks/codex-measure.js — the Codex measurement EVENT logger (separate from the injector hooks).
//
// Registered on Codex lifecycle events, it appends ONE metadata-only row per event to a local ledger, tagged
// with the holdout arm (so on/off can be compared post-hoc). It is NOT the thing that turns fablever on/off —
// the fable-session / fable-subagent injectors do that via the SAME assignArm() helper; this hook only
// records what happened in each arm. Codex says the transcript format is not a stable interface, so we
// aggregate from the structured hook events, never by parsing a transcript.
//
// PRIVACY (load-bearing): metadata only. No raw session id, no raw cwd, no prompt, no assistant text, no
// command, no tool input/output is ever written. Session/project are stored only as HMAC ids. Text-derived
// signals are OFF unless FABLE_MEASURE_TEXT_SIGNALS=on, and even then only BOOLEAN flags are stored — never
// the source text. Fail-open: any error exits 0 with no stdout. Zero dependencies.
const fs = require('fs');
const path = require('path');
const { anonId } = require('../runtime/privacy.cjs');
const { assignArm, isOpusModel } = require('../runtime/assign.cjs');

const onish = v => /^(on|1|true|yes)$/i.test(String(v || ''));
// model/permission_mode are host-set metadata, but we treat the event as untrusted: bound them so an
// unexpected/oversized/secret-shaped value can never land verbatim in the ledger (metadata-only contract).
const PERM_MODES = new Set(['default', 'plan', 'acceptedits', 'acceptedits-once', 'bypasspermissions', 'read-only', 'workspace-write', 'danger-full-access', 'unknown']);
const safeModel = v => {
  const s = String(v || 'unknown');
  if (isOpusModel(s)) return 'claude-opus';
  return (s.length <= 40 && /^[\w.\-:]+$/.test(s)) ? s : 'other';
};
const safePerm = v => { const s = String(v || 'unknown').toLowerCase(); return PERM_MODES.has(s) ? s : 'other'; };
// user "steer me back" proxy (EN + KO) — applied ONLY to the user's own prompt, only in the opt-in tier.
const REINSTRUCT = /\b(no,|nope|actually|that'?s wrong|not what i|undo|revert|stop,|wrong|instead|don'?t do)\b|아니|다시|틀렸|되돌|그게 아니|하지\s*마/i;
const EDIT_TOOLS = /^(edit|write|multiedit|notebookedit|apply_patch|applypatch|update_plan)$/i;
const SHELL_TOOLS = /^(bash|shell|local_shell|exec)$/i;

function appendEvent(baseDir, sessionKey, row) {
  const dir = path.join(baseDir, 'events');
  fs.mkdirSync(dir, { recursive: true });
  // One file per session keeps concurrent appends from different sessions off each other's lines.
  fs.appendFileSync(path.join(dir, `${sessionKey}.jsonl`), JSON.stringify(row) + '\n');
}

try {
  if (!onish(process.env.FABLE_MEASURE)) process.exit(0);
  if (String(process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);

  const baseDir = process.env.FABLE_MEASURE_HOME;
  const campaignId = process.env.FABLE_MEASURE_CAMPAIGN;
  if (!baseDir || !campaignId) process.exit(0);

  let ev = {};
  try { ev = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { process.exit(0); }
  const sessionId = String(ev.session_id || ev.sessionId || '').trim();
  if (!sessionId) process.exit(0);

  // Read the campaign salt — do NOT create it. The campaign `start` seeds it once, before any session, so
  // the injector guard (which only reads) and this logger always derive the same arm. If there is no salt
  // (FABLE_MEASURE set without starting a campaign), stay silent rather than create one and risk a
  // first-session arm mismatch where the guard injects but we log the session as the untreated baseline.
  let salt; try { salt = fs.readFileSync(path.join(baseDir, 'measurement-salt')); } catch (_) { process.exit(0); }
  const sessionKey = anonId('s', sessionId, salt);
  const projectKey = anonId('p', ev.cwd || '', salt); // cwd is HMAC'd, never stored raw
  const arm = assignArm({ campaignId, sessionId, salt, offPercent: Number(process.env.FABLE_MEASURE_OFF_PCT || 50) });

  const eventName = String(ev.hook_event_name || ev.hookEventName || 'unknown').toLowerCase();
  const textSignals = onish(process.env.FABLE_MEASURE_TEXT_SIGNALS);
  const metrics = {};

  if (eventName === 'sessionstart') metrics.session_start = 1;
  else if (eventName === 'userpromptsubmit') {
    metrics.user_turn = 1;
    if (textSignals) metrics.reinstruction = REINSTRUCT.test(String(ev.prompt || '')) ? 1 : 0;
  } else if (eventName === 'posttooluse') {
    metrics.tool_call = 1;
    const tn = String(ev.tool_name || '');
    if (EDIT_TOOLS.test(tn)) metrics.edit = 1;
    if (SHELL_TOOLS.test(tn)) metrics.shell_call = 1;
    // tool failure ONLY from structured metadata fields, never by reading tool output text.
    const failed = ev.tool_failed === true || ev.success === false || ev.status === 'error'
      || (typeof ev.exit_code === 'number' && ev.exit_code !== 0);
    if (failed) metrics.tool_failed = 1;
  } else if (eventName === 'subagentstart') metrics.subagent_start = 1;
  else if (eventName === 'subagentstop') metrics.subagent_stop = 1;
  else if (eventName === 'precompact') metrics.precompact = 1;
  else if (eventName === 'postcompact') metrics.postcompact = 1;
  else if (eventName === 'stop') metrics.turn_stop = 1;

  appendEvent(baseDir, sessionKey, {
    v: 2,
    campaign_id: String(campaignId),
    host: 'codex',
    session_key: sessionKey,
    project_key: projectKey,
    arm,
    event: eventName,
    ts_ms: Date.now(),
    model: safeModel(ev.model),
    permission_mode: safePerm(ev.permission_mode),
    metrics,
  });
} catch (_) {
  // fail-open, no stdout
}
process.exit(0);
