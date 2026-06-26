#!/usr/bin/env node
'use strict';
/*
 * fable-reinject.js — OPTIONAL Codex CLI UserPromptSubmit hook (installed only with --codex-with-reinject,
 * default OFF). Re-injects a tiny CORE reminder on each user prompt to fight working-style decay in very
 * long sessions. This bills context every turn (not cache-amortized), which is why it is opt-in — the
 * AGENTS.md layer + SessionStart hook are the primary, cheaper mechanisms.
 *
 * Zero dependencies. FAIL-OPEN: any error → exit 0, no stdout. Disable with FABLE_PROFILE=off.
 * Profile-home resolution: FABLE_PROFILE_HOME → FABLE_HOME/.. → <hookdir>/../fable-profile.
 */
const fs = require('fs');
const path = require('path');

const CORE_FALLBACK =
  'Fable reminder: act when you have enough (recommend, don\'t survey); lead with the outcome; don\'t ' +
  'over-build; ground every done/works claim in a tool result on the same line, else say "not verified"; ' +
  'stop only when truly blocked, don\'t end on a promise; no filler. Safety, explicit instructions, and ' +
  'approval prompts outrank decisiveness.';

function profileHomes() {
  const homes = [];
  if (process.env.FABLE_PROFILE_HOME) homes.push(process.env.FABLE_PROFILE_HOME);
  if (process.env.FABLE_HOME) homes.push(path.join(process.env.FABLE_HOME, '..'));
  homes.push(path.join(__dirname, '..', 'fable-profile'));
  return homes;
}
function readProfile(variant) {
  for (const home of profileHomes()) {
    for (const rel of [variant + '.md', path.join('runtime', 'profiles', variant + '.md')]) {
      try { const t = fs.readFileSync(path.join(home, rel), 'utf8').trim(); if (t) return t; } catch (_) {}
    }
  }
  return '';
}
function isOff() {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') return true;
  for (const home of profileHomes()) { try { if (fs.existsSync(path.join(home, 'OFF'))) return true; } catch (_) {} }
  return false;
}

// Measurement holdout: an 'off'-arm session suppresses the per-turn reminder (honest baseline).
// Resolved from runtime/repo; fail-open (any error → false → inject normally).
function isHoldoutOff(sessionId) {
  if (!sessionId) return false;
  const cands = [];
  if (process.env.FABLE_HOME) cands.push(path.join(process.env.FABLE_HOME, 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', '..', 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', 'fable-profile', 'runtime', 'measurement', 'runtime', 'holdout.cjs'));
  for (const c of cands) { try { return require(c).holdoutOff({ env: process.env, sessionId }); } catch (_) {} }
  return false;
}

try {
  if (isOff()) process.exit(0);
  // Read the UserPromptSubmit event only to honor the measurement holdout; the reminder text is constant.
  try { if (!process.stdin.isTTY) { const raw = fs.readFileSync(0, 'utf8'); if (raw && isHoldoutOff(String(JSON.parse(raw).session_id || '').trim())) process.exit(0); } } catch (_) {}
  const text = readProfile('core') || readProfile('compact') || CORE_FALLBACK;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text },
  }));
} catch (_) {
  // never block a prompt
}
process.exit(0);
