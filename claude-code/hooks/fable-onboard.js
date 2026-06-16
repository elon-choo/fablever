#!/usr/bin/env node
// fablever first-run onboarding — SessionStart hook. Until the user has set their defaults,
// it injects a one-time instruction so the agent NATURALLY runs setup: it does ALL the config
// itself and asks the user only for the irreducible human steps (issue a key / sign in).
// Once ~/.claude/fable-profile/onboarded exists, it stays silent.
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
    'fablever was just installed and the user has NOT set their defaults. This note shows only ' +
    'until setup is done. PRINCIPLE: do ALL the configuration yourself; ask the user ONLY for the ' +
    'irreducible human steps (issuing an API key, or signing in). Assume they may be new to AI/keys. ' +
    'Run this as a short, friendly setup before their first task.\n\n' +
    'STEP 1 — cost mode. Ask: "auto" (recommended: cheap by default, only spends on high-stakes ' +
    'reviews), "on" (always max quality), or "off" (always cheapest)? Then YOU write ' +
    path.join(dir, 'mode.json') + ' as {"ultra":"<choice>"}.\n\n' +
    'STEP 2 — cross-model reviewer. Show these FOUR presets and let them pick (run ' +
    '`node orchestration/lib/xverify-preset.mjs show` to display them; the previously chosen one is ' +
    'the default and stays selected next time):\n' +
    '  1) claude-only            — no key, no login, $0 (default).\n' +
    '  2) gpt-oauth              — add a GPT reviewer via their ChatGPT LOGIN (codex MCP), NO API key. ' +
    'Great if they have a ChatGPT account — recommend this one to most users.\n' +
    '  3) gpt-oauth+gemini-api   — GPT via ChatGPT login + Gemini via a Gemini API key.\n' +
    '  4) gpt-api+gemini-api     — both via API keys (one OpenRouter key covers both).\n' +
    'Apply the choice for them: `node orchestration/lib/xverify-preset.mjs set <preset>` (this persists ' +
    'as the default). They can change it anytime with the same command.\n\n' +
    'SECURITY — handling API keys (important):\n' +
    '- NEVER ask the user to paste an API key into this chat, and never put a key in a file you write ' +
    'or commit. Keys belong ONLY in their shell env.\n' +
    '- For a key preset, tell them to add it themselves in their terminal, e.g. ' +
    '`echo \'export OPENROUTER_API_KEY=...\' >> ~/.zshrc && source ~/.zshrc` (or GEMINI_API_KEY), then ' +
    'open a new session. Point them to where to GET the key (openrouter.ai/keys or aistudio.google.com).\n' +
    '- For gpt-oauth, the human step is just signing into ChatGPT via the codex MCP — no key.\n' +
    '- Verify with `node orchestration/lib/xverify-preset.mjs doctor` — it reports whether the needed ' +
    'key is PRESENT (true/false) and NEVER prints the value. Do not echo key values yourself either.\n\n' +
    'FINISH — create the file ' + flag + ' (any content) so this never repeats, then confirm what was ' +
    'set, what (if anything) the user still must do (issue key / sign in), and how to change later ' +
    '(re-run the xverify-preset set command, or export FABLE_ULTRA=...). Full guide: ' +
    'whitepaper/09-running-it.md. If the user says "skip"/"defaults", write {"ultra":"auto"} to ' +
    'mode.json, set preset claude-only, create the onboarded flag, and continue.';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }));
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
