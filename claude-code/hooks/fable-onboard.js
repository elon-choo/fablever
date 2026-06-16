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

  // SessionStart fires on startup / resume / clear / compact. Only run first-run setup on a real
  // start — never interrupt mid-work on a resume/compact. Fail-open: unknown source -> proceed.
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (input) { const src = (JSON.parse(input).source || '').toLowerCase(); if (src === 'resume' || src === 'compact') process.exit(0); }
  } catch (_) { /* no stdin / parse fail -> proceed */ }

  // Resolve the ABSOLUTE path to the installed orchestration libs, so the commands the agent runs
  // work from ANY cwd after the user restarts (they will NOT be in the repo clone dir). install.sh
  // copies orchestration/ into the immutable runtime and writes a 'fable-home' pointer to it.
  const exists = p => { try { return !!p && fs.existsSync(p); } catch { return false; } };
  let homePtr = '';
  try { homePtr = fs.readFileSync(path.join(dir, 'fable-home'), 'utf8').trim(); } catch (_) {}
  const bases = [
    process.env.FABLE_HOME,
    homePtr,
    path.join(dir, 'runtime'),
    path.join(__dirname, '..', '..'), // dev: hook running from inside the repo
  ].filter(Boolean);
  let preset = '';
  for (const b of bases) {
    const c = path.join(b, 'orchestration', 'lib', 'xverify-preset.mjs');
    if (exists(c)) { preset = c; break; }
  }
  // q() quotes the path for a shell command; if unresolved, we degrade gracefully (claude-only is
  // already the persisted default from install, so onboarding still completes with zero risk).
  const q = p => `'${p.replace(/'/g, `'\\''`)}'`;
  const cmd = sub => preset ? `node ${q(preset)} ${sub}` : `(orchestration tools not found — claude-only is already your default; skip cross-model setup)`;
  const modeJson = path.join(dir, 'mode.json');

  const ctx =
    '[fablever first-run setup — not yet configured]\n' +
    'fablever was just installed and the user has NOT confirmed their defaults. This note shows only ' +
    'until setup is done. PRINCIPLE: do ALL the configuration yourself; ask the user ONLY for the ' +
    'irreducible human steps (issuing an API key, or signing in). Assume they may be new to AI/keys. ' +
    'Run this as a short, friendly setup before their first task.\n\n' +
    'LANGUAGE — speak the user\'s language. Detect the language the user writes in and deliver this ' +
    'ENTIRE setup (questions, the preset names\' explanations, key/login guidance, confirmations) in ' +
    'THAT language, translated naturally — do not dump English at a non-English user. If they have not ' +
    'written yet, open with a one-line greeting and switch to whatever language they reply in. Keep ' +
    'commands, file paths, env-var names, and preset IDs (claude-only / gpt-oauth / …) verbatim; ' +
    'translate the prose around them. If you run a fablever CLI (e.g. xverify-preset show/doctor), ' +
    'TRANSLATE its output for the user — never paste raw English preset lists or raw JSON into a ' +
    'non-English chat; summarize it in their language.\n\n' +
    'STEP 0 — respect the user\'s intent; this is OPTIONAL. The install already wrote working defaults ' +
    '(cost mode "auto", reviewer "claude-only" — no key, $0, fully functional), and this prompt will ' +
    'NOT appear again regardless of what happens next. So if the user signals they just want to work — ' +
    'says "skip"/"later"/"not now", or simply gives you a task — STOP setup immediately, keep the ' +
    'defaults, and do their request. Do NOT insist, repeat, or block their first task.\n\n' +
    'STEP 1 — cost mode. The installer already seeded ' + modeJson + ' as {"ultra":"auto"} (cheap by ' +
    'default, spends only on high-stakes reviews). Ask if they want "auto" (recommended), "on" (always ' +
    'max quality), or "off" (always cheapest). ONLY if they change it, rewrite ' + modeJson + ' as ' +
    '{"ultra":"<choice>"}. If they say "skip"/"defaults", leave it — you are already done with this step.\n\n' +
    'STEP 2 — cross-model reviewer (optional). claude-only (no key, no login, $0) is ALREADY the saved ' +
    'default, so "skip" needs no command. To offer an upgrade, show these four presets (run ' +
    cmd('show') + ' to display them; the previously chosen one stays selected next time):\n' +
    '  1) claude-only            — no key, no login, $0 (current default).\n' +
    '  2) gpt-oauth              — add a GPT reviewer via their ChatGPT LOGIN (codex MCP), NO API key. ' +
    'Great if they already have a ChatGPT account.\n' +
    '  3) gpt-oauth+gemini-api   — GPT via ChatGPT login + Gemini via a Gemini API key.\n' +
    '  4) gpt-api+gemini-api     — both via API keys (one OpenRouter key covers both).\n' +
    'If they pick something other than claude-only, apply it FOR them: ' + cmd('set <preset>') + ' ' +
    '(persists as the new default; changeable anytime with the same command).\n\n' +
    'SECURITY — handling API keys (important):\n' +
    '- NEVER ask the user to paste an API key into this chat, and never put a key in a file you write ' +
    'or commit. Keys belong ONLY in their shell env.\n' +
    '- For a key preset, tell them to add it themselves in their terminal — use the rc file their shell ' +
    'actually reads (zsh: ~/.zshrc, bash: ~/.bashrc), e.g. ' +
    '`echo \'export OPENROUTER_API_KEY=...\' >> ~/.zshrc && source ~/.zshrc` (or GEMINI_API_KEY), then ' +
    'open a new session. Point them to where to GET the key (openrouter.ai/keys or aistudio.google.com).\n' +
    '- For gpt-oauth there is NO API key — the human step is installing the codex CLI and signing into ' +
    'ChatGPT. Relay these EXACT three terminal commands (do not improvise): ' +
    '(1) `npm install -g @openai/codex`  (2) `codex login`  (3) `claude mcp add --transport stdio codex ' +
    '--scope user -- codex mcp-server` — then `claude mcp list` should show `codex ✔ Connected`. Confirm ' +
    'each command succeeded before the next; if codex is already set up, skip.\n' +
    '- Verify the chosen preset with ' + cmd('doctor') + ' — it reports whether the needed key is PRESENT ' +
    '(true/false) and, for gpt-oauth, whether codex is registered AND signed in. It NEVER prints a key ' +
    'value; do not echo key values yourself either. If doctor says "registered but NOT signed in", tell ' +
    'them to run `codex login`.\n\n' +
    'FINISH — tell the user what was set, what (if anything) they still must do (issue key / sign in), and ' +
    'how to change later (re-run the set command, or export FABLE_ULTRA=...). For more detail, point them ' +
    'to the guide IN THEIR LANGUAGE: https://github.com/elon-choo/fablever/blob/main/whitepaper/09-running-it.md ' +
    '(Korean: .../whitepaper/ko/09-running-it.md). The first-run prompt is already done — it will not repeat.';

  // Write the flag DETERMINISTICALLY here — so first-run setup is shown exactly ONCE and can never
  // re-nag, regardless of whether the agent acts on it. The seeded defaults already work, so a user
  // who ignores setup loses nothing; deleting ~/.claude/fable-profile/onboarded re-runs it on demand.
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(flag, 'shown\n'); } catch (_) {}

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }));
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
