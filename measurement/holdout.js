#!/usr/bin/env node
// fablever measurement — SessionStart holdout assignment (OUT-OF-BAND, OPT-IN, FAIL-OPEN).
//
// Why this exists: every other eval in this repo is single-turn. The one cost a single-turn A/B
// structurally cannot see is whether the always-on hook/gate layer HELPS or HURTS a long real session by
// filling context with verification noise — what the upgrade research calls the "harness paradox" (a 0.0
// lift is a break-even warning, not a pass). The only way to measure that is a longitudinal holdout on the
// operator's OWN sessions, with outcomes harvested AFTER the fact so the measurement never changes the
// behavior it measures (in-context logging would: a control group that sees a label starts citing it).
//
// What it does, ONLY when FABLE_MEASURE=on (default: does nothing, exits 0 immediately):
//   - recognizes Claude/Opus model ids and assigns them by HMAC(salt, campaign + session_id),
//   - deterministically assigns every other legacy session exactly as before (~80% on / ~20% off),
//   - appends an out-of-band ledger row (Opus rows use HMAC ids only; never shown to the model),
//   - for the `off` arm, drops a marker file the fablever hooks honor to SUPPRESS themselves this session
//     (so `off` sessions run without the reinject/subagent/gate layer — the true baseline arm).
// It NEVER writes to stdout and NEVER injects additionalContext — assignment must stay invisible to the
// model. Any error → silent exit 0. Disable with FABLE_MEASURE unset/off or FABLE_PROFILE=off.
//
// CONSENT: this is opt-in precisely because the `off` arm runs ~1 in 5 of your sessions WITHOUT fablever.
// That degradation IS the measurement; you turn it on for a campaign, read the analysis, then turn it off.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const OFF_FRACTION = 20; // percent of sessions assigned to the untreated holdout arm
const OPUS_CAMPAIGN = 'claude-opus-holdout-v1';

// The installed hook is a standalone copy under ~/.claude/hooks. Prefer the shared runtime when this file
// runs from the repo; keep byte-equivalent built-in fallbacks so the installed/manual-copy path stays armed.
function fallbackIsOpusModel(model) {
  const tokens = String(model || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const claude = tokens.indexOf('claude');
  return claude >= 0 && tokens.indexOf('opus', claude + 1) > claude;
}
function fallbackAssignArm({ campaignId, sessionId, salt, offPercent }) {
  let pct = Number(offPercent);
  if (!Number.isFinite(pct)) pct = 50;
  pct = Math.max(0, Math.min(100, pct));
  const hex = crypto.createHmac('sha256', salt)
    .update(`${String(campaignId)}\0${String(sessionId)}`)
    .digest('hex').slice(0, 8);
  return (parseInt(hex, 16) % 100) < pct ? 'off' : 'on';
}
function fallbackReadOrCreateSalt(baseDir) {
  const file = path.join(baseDir, 'measurement-salt');
  try { return fs.readFileSync(file); } catch { /* create below */ }
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch {}
  const salt = crypto.randomBytes(32);
  try {
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, salt); } finally { fs.closeSync(fd); }
    return salt;
  } catch {
    try { return fs.readFileSync(file); } catch { return salt; }
  }
}
function fallbackAnonId(prefix, value, salt) {
  const digest = crypto.createHmac('sha256', salt).update(String(value || '')).digest('hex');
  return `${prefix}_${digest.slice(0, 24)}`;
}
function loadRuntime() {
  try {
    const assign = require('./runtime/assign.cjs');
    const privacy = require('./runtime/privacy.cjs');
    return {
      assignArm: assign.assignArm,
      isOpusModel: assign.isOpusModel,
      readOrCreateSalt: privacy.readOrCreateSalt,
      anonId: privacy.anonId,
    };
  } catch {
    return {
      assignArm: fallbackAssignArm,
      isOpusModel: fallbackIsOpusModel,
      readOrCreateSalt: fallbackReadOrCreateSalt,
      anonId: fallbackAnonId,
    };
  }
}

try {
  const measure = (process.env.FABLE_MEASURE || '').toLowerCase();
  if (measure !== 'on' && measure !== '1' && measure !== 'true') process.exit(0);
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);

  // SessionStart event arrives as JSON on stdin: { session_id, cwd, model, ... }
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { /* no stdin → bail */ }
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { ev = {}; }
  const sid = String(ev.session_id || ev.sessionId || '').trim();
  if (!sid) process.exit(0); // can't assign without a stable id

  const legacyBaseDir = path.join(os.homedir(), '.claude', 'fable-profile');
  const runtime = loadRuntime();

  // Additive Opus path: seeded HMAC assignment + HMAC-only storage. The model id is used only to select
  // this path; it never enters the arm hash or ledger. Non-Opus sessions continue through the legacy code
  // below with the exact historical SHA(session_id) assignment.
  if (runtime.isOpusModel(ev.model)) {
    const baseDir = process.env.FABLE_MEASURE_HOME || legacyBaseDir;
    const salt = runtime.readOrCreateSalt(baseDir);
    const sessionKey = runtime.anonId('s', sid, salt);
    const projectKey = runtime.anonId('p', ev.cwd || '', salt);
    const arm = runtime.assignArm({
      campaignId: process.env.FABLE_MEASURE_CAMPAIGN || OPUS_CAMPAIGN,
      sessionId: sid,
      salt,
      offPercent: OFF_FRACTION,
    });
    const holdoutDir = path.join(baseDir, 'holdout');
    try { fs.mkdirSync(holdoutDir, { recursive: true }); } catch {}
    const markerPath = path.join(holdoutDir, `${sessionKey}.off`);
    if (arm === 'off') {
      try { fs.writeFileSync(markerPath, ''); } catch { /* fail-open */ }
    } else {
      try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch { /* fail-open */ }
    }
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      host: 'claude-code',
      campaign_id: process.env.FABLE_MEASURE_CAMPAIGN || OPUS_CAMPAIGN,
      session_key: sessionKey,
      project_key: projectKey,
      arm,
      model: 'claude-opus',
    }) + '\n';
    try { fs.appendFileSync(path.join(baseDir, 'measure-ledger.jsonl'), line); } catch { /* fail-open */ }
    process.exit(0);
  }

  const baseDir = legacyBaseDir;
  const holdoutDir = path.join(baseDir, 'holdout');
  fs.mkdirSync(holdoutDir, { recursive: true });

  // Normalize ONCE and key BOTH the arm hash and the marker filename off the same value, so the readers
  // (which look up by sanitized sid) always agree with the arm decision — no hash/filename asymmetry.
  const safe = sid.replace(/[^A-Za-z0-9_-]/g, '_'); // identical sanitization to fable-reinject.sh
  const h = crypto.createHash('sha256').update(safe).digest('hex').slice(0, 8);
  const bucket = parseInt(h, 16) % 100;
  const arm = bucket < OFF_FRACTION ? 'off' : 'on';
  const markerPath = path.join(holdoutDir, `${safe}.off`);
  if (arm === 'off') {
    try { fs.writeFileSync(markerPath, ''); } catch { /* fail-open */ }
  } else {
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch { /* fail-open */ }
  }

  // out-of-band ledger — one event per assignment. Never read back into model context.
  const line = JSON.stringify({ ts: new Date().toISOString(), session_id: sid, arm, cwd: ev.cwd || '' }) + '\n';
  try { fs.appendFileSync(path.join(baseDir, 'measure-ledger.jsonl'), line); } catch { /* fail-open */ }

  process.exit(0); // print NOTHING — assignment stays invisible to the model
} catch {
  process.exit(0);
}
