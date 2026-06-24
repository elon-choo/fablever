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
//   - deterministically assigns this session to arm `on` (~80%) or `off` (~20%) by hashing session_id,
//   - appends one line {ts, session_id, arm, cwd} to an out-of-band ledger (never shown to the model),
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

try {
  const measure = (process.env.FABLE_MEASURE || '').toLowerCase();
  if (measure !== 'on' && measure !== '1' && measure !== 'true') process.exit(0);
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);

  // SessionStart event arrives as JSON on stdin: { session_id, cwd, ... }
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { /* no stdin → bail */ }
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { ev = {}; }
  const sid = String(ev.session_id || ev.sessionId || '').trim();
  if (!sid) process.exit(0); // can't assign without a stable id

  const baseDir = path.join(os.homedir(), '.claude', 'fable-profile');
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
