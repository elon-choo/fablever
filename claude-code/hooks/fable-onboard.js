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
    'STEP 0 — stop the nag first. Immediately create the file ' + flag + ' (any content). Do this BEFORE ' +
    'anything else so that even if later steps are skipped or error, this prompt never repeats and the ' +
    'session is never blocked (the install already wrote working defaults: cost mode "auto", reviewer ' +
    '"claude-only" — both fully functional with no key).\n\n' +
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
    '- For gpt-oauth there is NO key: the human step is installing the codex CLI and signing into ChatGPT. ' +
    'The exact 3 commands are in docs/API-KEYS.md (§ "Set up the codex MCP"); relay them, do not improvise.\n' +
    '- Verify with ' + cmd('doctor') + ' — it reports whether the needed key is PRESENT (true/false) and ' +
    'NEVER prints the value. Do not echo key values yourself either.\n\n' +
    'FINISH — confirm the onboarded flag exists (from STEP 0), then tell the user what was set, what (if ' +
    'anything) they still must do (issue key / sign in), and how to change later (re-run the set command, ' +
    'or export FABLE_ULTRA=...). Full guide: whitepaper/09-running-it.md.';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }));
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
