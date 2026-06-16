// fablever cross-model PRESET manager — pick one of 4 reviewer setups, change anytime, and the
// choice persists as the default. Writes ~/.claude/fable-profile/xverify.json (the file the
// orchestrate skill already reads). Zero dependencies.
//
// SECURITY: this NEVER asks for, stores, prints, or transmits an API key. Keys live only in the
// user's shell env (~/.zshrc). `doctor` reports whether a required key is PRESENT (true/false) —
// it never reads or echoes the value.
//
// CLI:
//   node xverify-preset.mjs show            # list presets, mark the current default
//   node xverify-preset.mjs current         # print the saved preset id
//   node xverify-preset.mjs set <preset>    # choose a preset (persists as default)
//   node xverify-preset.mjs doctor          # what (if anything) the user still must provide
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Best-effort: is the codex MCP set up? Returns true / false / null(unverifiable). Prevents a
// false green light on gpt-oauth when codex was never connected. Fast path = read the Claude Code
// MCP registry (~/.claude.json, instant, no ping); slow path = `claude mcp list` as a fallback.
function codexConnected() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
    const has = o => o && o.mcpServers && Object.keys(o.mcpServers).some(k => /codex/i.test(k));
    if (has(cfg)) return true;
    if (cfg.projects && Object.values(cfg.projects).some(has)) return true;
    return false;                                               // config readable, no codex -> not set up
  } catch { /* config missing/unreadable -> try the CLI */ }
  try {
    const out = execSync('claude mcp list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    if (/(^|\n)\s*codex\b/.test(out)) return true;             // registered (connected or just listed)
    return false;
  } catch { return null; }                                      // no claude CLI / error -> unverifiable
}

// Is the user actually SIGNED IN to codex (not just registered)? true / false / null(unknown).
// Registered-but-not-logged-in is the real failure mode that otherwise reads as "ready".
function codexAuthed() {
  try {
    execSync('codex login status', { stdio: 'ignore', timeout: 6000 });
    return true;                                                // exit 0 => signed in
  } catch (e) {
    if (e && (e.code === 'ENOENT' || /ENOENT/.test(String(e.message)))) return null; // codex CLI absent
    return false;                                               // non-zero => not signed in
  }
}

const CFG = path.join(os.homedir(), '.claude', 'fable-profile', 'xverify.json');

// The 4 presets. `mode` stays compatible with the orchestrate skill (off | codex | openrouter)
// plus one new combined mode (codex+gemini). `needs` = what the USER must provide (nothing for
// Claude-only; an OAuth login and/or an API key otherwise).
export const PRESETS = {
  'claude-only': {
    label: 'Claude Code only (no cross-model)',
    config: { mode: 'off' },
    needs: [],
    blurb: 'Same-family Claude panel only. No key, no login, $0, zero network.',
  },
  'gpt-oauth': {
    label: 'GPT reviewer via ChatGPT login (codex, no API key)',
    config: { mode: 'codex', models: ['gpt-5.5'], auth: { gpt: 'oauth-codex' } },
    needs: [{ kind: 'codex', what: 'Connect the codex MCP and sign in to ChatGPT (claude mcp list to verify).' }],
    blurb: 'Adds a GPT reviewer using your ChatGPT subscription — no API key, no per-call billing.',
  },
  'gpt-oauth+gemini-api': {
    label: 'GPT via ChatGPT login + Gemini via API key',
    config: { mode: 'codex+gemini', models: ['gpt-5.5', 'gemini-3.1-pro-preview'], auth: { gpt: 'oauth-codex', gemini: 'api' } },
    needs: [
      { kind: 'codex', what: 'Connect the codex MCP and sign in to ChatGPT.' },
      { kind: 'env', env: 'GEMINI_API_KEY', alt: 'GOOGLE_API_KEY', what: 'A Google Gemini API key from aistudio.google.com (free tier exists).' },
    ],
    blurb: 'GPT via your ChatGPT login + a different-weights Gemini reviewer via a Gemini API key.',
  },
  'gpt-api+gemini-api': {
    label: 'GPT + Gemini via API keys (OpenRouter)',
    config: { mode: 'openrouter', models: ['openai/gpt-5.5', 'google/gemini-3.1-pro-preview'], auth: { gpt: 'api', gemini: 'api' } },
    needs: [{ kind: 'env', env: 'OPENROUTER_API_KEY', what: 'One OpenRouter API key (openrouter.ai/keys) covers both GPT and Gemini.' }],
    blurb: 'Both reviewers via API keys. One OpenRouter key reaches GPT + Gemini.',
  },
};
export const DEFAULT_PRESET = 'claude-only';

const read = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { return null; } };

export function current() {
  const c = read();
  if (c && c.preset && PRESETS[c.preset]) return c.preset;
  // infer from a legacy {mode} file, else default
  if (c && c.mode) { for (const [k, p] of Object.entries(PRESETS)) if (p.config.mode === c.mode) return k; }
  return DEFAULT_PRESET;
}

export function set(preset) {
  if (!PRESETS[preset]) throw new Error('unknown preset: ' + preset + ' (one of: ' + Object.keys(PRESETS).join(', ') + ')');
  const out = { preset, ...PRESETS[preset].config, n: 1 };
  fs.mkdirSync(path.dirname(CFG), { recursive: true });
  fs.writeFileSync(CFG, JSON.stringify(out, null, 2) + '\n');
  return out;
}

// What the user still must do for the chosen preset. Reports key PRESENCE only — never the value.
export function doctor(preset = current()) {
  const p = PRESETS[preset];
  let codexState; // computed lazily, only if a codex need exists
  const items = (p.needs || []).map(n => {
    if (n.kind === 'env') {
      const present = !!(process.env[n.env] || (n.alt && process.env[n.alt]));
      return { ...n, satisfied: present, hint: present ? `${n.env} is set ✓` : `set ${n.env} in ~/.zshrc (never paste it into chat)` };
    }
    if (n.kind === 'codex') {
      if (codexState === undefined) codexState = codexConnected();
      const authed = codexState === true ? codexAuthed() : null; // only check sign-in if registered
      // satisfied = registered AND not-known-to-be-signed-out. registered+signed-out => false.
      const satisfied = codexState === true ? (authed !== false) : codexState;
      const hint = codexState === false ? 'codex MCP not set up — see docs/API-KEYS.md § Set up the codex MCP (codex login + claude mcp add ... codex mcp-server)'
        : codexState === null ? 'could not verify (claude CLI not found) — see docs/API-KEYS.md § Set up the codex MCP'
        : authed === false ? 'codex MCP registered but you are NOT signed in — run: codex login'
        : authed === true ? 'codex MCP registered + signed in ✓'
        : 'codex MCP registered ✓ (codex CLI not found here to confirm sign-in; if the GPT reviewer fails, run: codex login)';
      return { ...n, satisfied, hint };
    }
    return { ...n, satisfied: null, hint: n.what };
  });
  // ready ONLY when every need is confirmed satisfied (a null/unverifiable need is NOT "ready" —
  // this is the fix for the false green light on gpt-oauth when codex was never connected).
  return { preset, label: p.label, ready: items.every(i => i.satisfied === true), items };
}

// Robust "is this the entry script?" check — resolve argv[1] through symlinks (e.g. a HOME under
// /tmp or /var on macOS) so the CLI still runs when the invocation path traverses a symlink.
const isMain = (() => {
  try { return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; }
  catch { return import.meta.url === `file://${process.argv[1]}`; }
})();
if (isMain) {
  const cmd = process.argv[2] || 'show';
  const presetList = Object.keys(PRESETS).join(', ');
  // gentle signal: if the saved config exists but is corrupt, current() silently falls back —
  // tell the user instead of pretending their edit took.
  try { if (fs.existsSync(CFG)) JSON.parse(fs.readFileSync(CFG, 'utf8')); }
  catch { console.error(`warning: ${CFG} is unreadable/corrupt — using default "${DEFAULT_PRESET}". Fix the file or run: set <preset>`); }
  const cur = current();
  if (cmd === 'show') {
    console.log('Cross-model reviewer presets (current default marked ▶):\n');
    for (const [id, p] of Object.entries(PRESETS)) {
      console.log(`${id === cur ? '▶' : ' '} ${id}\n    ${p.label}\n    ${p.blurb}`);
    }
    console.log(`\nChange: node orchestration/lib/xverify-preset.mjs set <preset>   (persists as the new default)`);
  } else if (cmd === 'current') {
    console.log(cur);
  } else if (cmd === 'set') {
    const want = process.argv[3];
    if (!want) { console.error(`usage: set <preset>\npresets: ${presetList}`); process.exit(1); }
    if (!PRESETS[want]) { console.error(`unknown preset "${want}". Pick one of: ${presetList}`); process.exit(1); }
    const out = set(want);
    console.log('set preset =', out.preset, '\nwrote', CFG, '\n' + JSON.stringify(doctor(out.preset), null, 2));
  } else if (cmd === 'doctor') {
    const want = process.argv[3] || cur;
    if (!PRESETS[want]) { console.error(`unknown preset "${want}". Pick one of: ${presetList}`); process.exit(1); }
    console.log(JSON.stringify(doctor(want), null, 2));
  } else if (cmd === '--selftest') {
    let ok = 0, n = 0;
    const t = (c, m) => { n++; if (c) ok++; else console.log('FAIL', m); };
    t(Object.keys(PRESETS).length === 4, '4 presets');
    t(PRESETS['claude-only'].config.mode === 'off', 'claude-only=off');
    t(PRESETS['gpt-oauth'].config.mode === 'codex', 'gpt-oauth=codex');
    t(PRESETS['gpt-api+gemini-api'].config.mode === 'openrouter', 'api=openrouter');
    t(PRESETS['claude-only'].needs.length === 0, 'claude-only needs nothing');
    const d = doctor('gpt-api+gemini-api');
    t(d.items[0].env === 'OPENROUTER_API_KEY', 'doctor reports the key name');
    t(!JSON.stringify(d).includes(process.env.OPENROUTER_API_KEY || ' NOKEY '), 'doctor never echoes a key value');
    t(doctor('claude-only').ready === true, 'claude-only is ready with zero needs');
    const _save = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
    t(doctor('gpt-api+gemini-api').ready === false, 'missing key => not ready (no false green light)');
    if (_save !== undefined) process.env.OPENROUTER_API_KEY = _save;
    console.log(`xverify-preset selftest: ${ok}/${n}`); process.exit(ok === n ? 0 : 1);
  } else { console.log('usage: show | current | set <preset> | doctor'); }
}
