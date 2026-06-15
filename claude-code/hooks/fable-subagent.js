#!/usr/bin/env node
'use strict';
/*
 * fable-subagent.js — SubagentStart hook. Injects the Fable working style into EVERY spawned subagent
 * (foreground, background/run_in_background, and workflow agents) — the agents that the main session's
 * output style and the UserPromptSubmit hook do NOT reach (subagents run with their own system prompt).
 *
 * Mechanism: SubagentStart fires when a subagent spawns; returning hookSpecificOutput.additionalContext
 * adds that text to the subagent's context. We inject the COMPACT reminder once at spawn (one-time cost,
 * no per-turn tax). Emitted as JSON (Node handles the escaping) so there is no jq/bash dependency.
 *
 * Disable: export FABLE_PROFILE=off   (or)   touch ~/.claude/fable-profile/OFF
 * Fail-safe: ALWAYS exits 0 and emits nothing on any error, so it can never block a subagent from starting.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  if (process.env.FABLE_PROFILE === 'off') process.exit(0);
  const dir = path.join(process.env.HOME || os.homedir(), '.claude', 'fable-profile');
  if (fs.existsSync(path.join(dir, 'OFF'))) process.exit(0);

  // Inject the compact reminder (fuller than core, but still ~1 paragraph) once per subagent.
  let text = '';
  for (const variant of ['compact', 'core']) {
    try {
      const t = fs.readFileSync(path.join(dir, variant + '.md'), 'utf8').trim();
      if (t) { text = t; break; }
    } catch (_) { /* try next */ }
  }
  if (!text) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text },
  }));
} catch (_) {
  // never block a subagent spawn
}
process.exit(0);
