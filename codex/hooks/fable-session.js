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
  'destructive-action confirmation outrank decisiveness.';

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

try {
  if (isOff()) process.exit(0);

  // SessionStart event arrives as JSON on stdin: { source: "startup"|"clear"|"resume"|"compact", ... }.
  // Fail-open: missing/unparseable stdin → treat as a startup so we still help on a normal launch.
  let src = 'startup';
  try {
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw) src = String((JSON.parse(raw).source || 'startup')).toLowerCase();
    }
  } catch (_) { /* proceed as startup */ }
  if (src === 'resume' || src === 'compact') process.exit(0);

  const text = readProfile('compact') || readProfile('core') || COMPACT_FALLBACK;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
  }));
} catch (_) {
  // never block a session start
}
process.exit(0);
