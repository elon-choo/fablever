'use strict';
// measurement/runtime/assign.cjs — deterministic, race-invariant holdout assignment.
//
// Codex runs every hook matching an event CONCURRENTLY, so we cannot have one hook write an "arm marker"
// that another reads — that is a race. Instead every fable hook (the injectors AND the measure logger)
// calls this same pure function, which derives the arm from HMAC(salt, campaignId\0sessionId). Same inputs
// → same arm, regardless of which hook runs first or whether they run in parallel. The salt is a local
// secret (see privacy.cjs), so the assignment is unguessable and stable per session. Zero dependencies.
const crypto = require('crypto');

// Opus-bearing model ids are recognized for campaign filtering/reporting only. The model id is NEVER an
// assignment input: arm selection stays condition-blind and depends only on campaign + session + salt.
function isOpusModel(model) {
  const tokens = String(model || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const claude = tokens.indexOf('claude');
  return claude >= 0 && tokens.indexOf('opus', claude + 1) > claude;
}

// → 'off' | 'on'. offPercent is the share of sessions held OUT (untreated). Clamped to [0,100]; a NaN or
// out-of-range value falls back to 50 (a balanced campaign), never an accidental all-on/all-off.
function assignArm({ campaignId, sessionId, salt, offPercent }) {
  let pct = Number(offPercent);
  if (!Number.isFinite(pct)) pct = 50;
  pct = Math.max(0, Math.min(100, pct));
  const hex = crypto.createHmac('sha256', salt)
    .update(`${String(campaignId)}\0${String(sessionId)}`)
    .digest('hex').slice(0, 8);
  const bucket = parseInt(hex, 16) % 100; // 0..99
  return bucket < pct ? 'off' : 'on';
}

module.exports = { assignArm, isOpusModel };
