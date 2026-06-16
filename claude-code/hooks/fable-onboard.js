#!/usr/bin/env node
// fablever first-run onboarding — SessionStart hook. Until the user has set their defaults,
// it injects a one-time instruction so the agent NATURALLY asks a couple of friendly setup
// questions and writes the config. Once ~/.claude/fable-profile/onboarded exists, it stays silent.
// FAIL-OPEN, NON-BLOCKING. Disable with FABLE_ONBOARD=off or FABLE_PROFILE=off.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);
  if ((process.env.FABLE_ONBOARD || '').toLowerCase() === 'off') process.exit(0);

  const dir = path.join(os.homedir(), '.claude', 'fable-profile');
  const flag = path.join(dir, 'onboarded');
  if (fs.existsSync(flag)) process.exit(0); // already set up -> say nothing

  const ctx =
    '[fablever first-run setup — not yet configured]\n' +
    'fablever was just installed and the user has NOT set their defaults yet. This note shows ' +
    'only until setup is done. Before the user\'s first task, warmly and briefly guide them through ' +
    'a one-time setup — assume they may be new to AI and to API keys. Ask just two plain-language ' +
    'questions (use the question UI if available):\n' +
    '1) Cost mode — "auto" (recommended: cheap by default, only spends extra on high-stakes reviews ' +
    'like security/release), "on" (always maximum quality, costs more), or "off" (always cheapest)?\n' +
    '2) Cross-model verification (optional, off by default) — stay Claude-only (no key, $0), OR add a ' +
    'different-weights reviewer with an OpenAI/Google API key, OR use ChatGPT login via the codex MCP. ' +
    'If they seem unsure, note in one line: an API key is a separate paid thing, NOT your ChatGPT/Gemini ' +
    'app subscription (the codex option reuses a ChatGPT login).\n' +
    'Keep it to those two; do not overwhelm a beginner. Then APPLY their choices:\n' +
    '- write ' + path.join(dir, 'mode.json') + ' as {"ultra":"<auto|on|off>"}\n' +
    '- if they picked a key path, tell them which env var to set (OPENAI_API_KEY or GEMINI_API_KEY) and ' +
    'mention FABLE_XVERIFY; if Claude-only, leave cross-model off (nothing to set).\n' +
    '- create the file ' + flag + ' (any content) so this setup never repeats.\n' +
    'Then confirm what was set and how to change it later (edit mode.json, or export FABLE_ULTRA=...; ' +
    'full guide: whitepaper/09-running-it.md). If the user says "skip" or "defaults", write ' +
    '{"ultra":"auto"} to mode.json, create the onboarded flag, and just continue.';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }));
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
