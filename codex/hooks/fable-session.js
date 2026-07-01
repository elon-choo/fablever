#!/usr/bin/env node
'use strict';
/*
 * fable-session.js — Codex CLI SessionStart hook. Injects the COMPACT fablever working-style reminder as
 * developer context at the start of a fresh Codex session, reinforcing the AGENTS.md layer.
 *
 * Codex parity with the Claude-Code design: SessionStart fires on startup / clear / resume / compact. We
 * inject ONLY on a real start (`source` of "startup" or "clear"); `resume`/`compact` are no-ops so we never
 * re-inject mid-work. The reminder is emitted as hookSpecificOutput.additionalContext (Codex adds it to the
 * session's developer context).
 *
 * Zero dependencies (Node built-ins only). FAIL-OPEN: any error → exit 0 with no stdout, so it can never
 * block a session from starting. Disable with FABLE_PROFILE=off (or touch <profile-home>/OFF).
 *
 * Profile-home resolution order: FABLE_PROFILE_HOME env → FABLE_HOME/.. → <hookdir>/../fable-profile.
 */
const fs = require('fs');
const path = require('path');

const COMPACT_FALLBACK =
  'Fable working style (Codex): act when you have enough — recommend, don\'t survey (ask once only if ' +
  'genuinely ambiguous and costly to undo); lead with the outcome; don\'t over-build; respect the exact ' +
  'scope asked; when the user is only asking, report and stop; ground every done/works/fixed claim in a ' +
  'tool/file/test result on the same line, else say "not verified"; stop only when truly blocked and don\'t ' +
  'end on a promise; no filler. Safety, explicit user/project instructions, approval prompts, and ' +
  'destructive-action confirmation outrank decisiveness. Use proportionality when rules collide: ' +
  'format/length caps constrain prose only and never cut the P5 evidence check or P7 decision trail; ' +
  'preambles stay silent on single-step work, factual notes only on three-or-more-step work; ' +
  'early-stop limits search breadth, not grounding depth; verification strength scales with blast radius.';

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
      try {
        const t = fs.readFileSync(path.join(home, rel), 'utf8').trim();
        if (t) return t;
      } catch (_) { /* try next */ }
    }
  }
  return '';
}

function isOff() {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') return true;
  for (const home of profileHomes()) {
    try { if (fs.existsSync(path.join(home, 'OFF'))) return true; } catch (_) {}
  }
  return false;
}

// Measurement holdout: during a campaign, an 'off'-arm session SUPPRESSES injection (honest baseline). The
// guard lives in the runtime/repo; fail-open (any resolution/error → false → inject normally).
function isHoldoutOff(sessionId) {
  if (!sessionId) return false;
  const cands = [];
  if (process.env.FABLE_HOME) cands.push(path.join(process.env.FABLE_HOME, 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', '..', 'measurement', 'runtime', 'holdout.cjs'));
  cands.push(path.join(__dirname, '..', 'fable-profile', 'runtime', 'measurement', 'runtime', 'holdout.cjs'));
  for (const c of cands) { try { return require(c).holdoutOff({ env: process.env, sessionId }); } catch (_) {} }
  return false;
}

// Opt-in, ZERO-CONTENT trust trace: if FABLE_HOOK_TRACE_FILE is set (the codex-native-ab harness sets it),
// append a {hook, ts} line — no prompt, path, or session id. Its presence after a run proves Codex actually
// ran (i.e. trusted) this command hook, so an H/S arm can't silently collapse to "hooks installed but inert".
function traceHook(name) {
  const f = process.env.FABLE_HOOK_TRACE_FILE;
  if (!f) return;
  try { fs.appendFileSync(f, JSON.stringify({ hook: name, ts: Date.now() }) + '\n'); } catch (_) {}
}

try {
  traceHook('fable-session');
  if (isOff()) process.exit(0);

  // SessionStart event arrives as JSON on stdin: { source: "startup"|"clear"|"resume"|"compact", session_id }.
  // Fail-open: missing/unparseable stdin → treat as a startup so we still help on a normal launch.
  let src = 'startup', sid = '';
  try {
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw) { const ev = JSON.parse(raw); src = String(ev.source || 'startup').toLowerCase(); sid = String(ev.session_id || ev.sessionId || '').trim(); }
    }
  } catch (_) { /* proceed as startup */ }
  if (src === 'resume' || src === 'compact') process.exit(0);
  if (isHoldoutOff(sid)) process.exit(0); // measurement off-arm: stay silent for an honest baseline

  const text = readProfile('compact') || readProfile('core') || COMPACT_FALLBACK;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  }));
} catch (_) {
  // never block a session start
}
process.exit(0);
