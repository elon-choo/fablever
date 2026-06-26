#!/usr/bin/env node
// install.mjs — the UNIVERSAL (cross-platform) Fable Profile installer.
//
// Works on macOS, Linux, AND native Windows (PowerShell/cmd, no WSL needed) — because everything
// it touches is Node: it reuses claude-code/lib/settings-merge.js for the settings edits, copies the
// same Node hooks/MCP, and seeds the same config. `./install.sh` is the POSIX convenience wrapper;
// this file is the one command that runs everywhere:  node install.mjs
//
//   node install.mjs                 output style (always-on) + SubagentStart + 2 SessionStart hooks + MCP
//   node install.mjs --with-hook     also the opt-in per-turn re-injection hook (POSIX only; skipped on Windows)
//   node install.mjs --with-fusion   register the optional OpenRouter Fusion MCP
//   node install.mjs --with-xverify[=openrouter|codex|<preset>]   enable cross-model verification
//   node install.mjs --no-mcp | --no-style | --no-subagent | --no-onboard | --no-modelcheck
//   node install.mjs --uninstall     remove everything cleanly (restores prior settings)
//   node install.mjs --help
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
const REPO = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const STYLES_DIR = path.join(CLAUDE_DIR, 'output-styles');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const PROFILE_DST_DIR = path.join(CLAUDE_DIR, 'fable-profile');
const RUNTIME_DIR = path.join(PROFILE_DST_DIR, 'runtime');
const STYLE_DST = path.join(STYLES_DIR, 'Fable.md');
const XVERIFY_CFG = path.join(PROFILE_DST_DIR, 'xverify.json');
const MODE_CFG = path.join(PROFILE_DST_DIR, 'mode.json');
const FABLE_HOME_PTR = path.join(PROFILE_DST_DIR, 'fable-home');
const MERGE = path.join(REPO, 'claude-code', 'lib', 'settings-merge.js');
const MCP_REMOVE = path.join(REPO, 'claude-code', 'lib', 'mcp-remove.js');
const XVPRESET = path.join(REPO, 'orchestration', 'lib', 'xverify-preset.mjs');
const MCP_SERVER = path.join(RUNTIME_DIR, 'mcp', 'src', 'server.js');
const FUSION_SERVER = path.join(RUNTIME_DIR, 'fusion', 'fusion-server.js');

// Hooks: Node hooks run as `node <path>`; the reinject hook is a bash script (POSIX only).
// On POSIX we emit the same `$HOME/...` command strings install.sh uses (so the two installers are
// mutually idempotent). On Windows `$HOME` would not expand, so we emit the absolute quoted path.
const hookCmd = (file, viaNode = true) => {
  const pre = viaNode ? 'node ' : '';
  return isWin ? `${pre}"${path.join(HOOKS_DIR, file)}"` : `${pre}$HOME/.claude/hooks/${file}`;
};
const SUBHOOK = { src: path.join(REPO, 'claude-code/hooks/fable-subagent.js'), dst: path.join(HOOKS_DIR, 'fable-subagent.js'), cmd: hookCmd('fable-subagent.js') };
const ONBOARD = { src: path.join(REPO, 'claude-code/hooks/fable-onboard.js'), dst: path.join(HOOKS_DIR, 'fable-onboard.js'), cmd: hookCmd('fable-onboard.js') };
const MODELCHK = { src: path.join(REPO, 'claude-code/hooks/fable-model-check.js'), dst: path.join(HOOKS_DIR, 'fable-model-check.js'), cmd: hookCmd('fable-model-check.js') };
const UPDATECHK = { src: path.join(REPO, 'claude-code/hooks/fable-update-check.js'), dst: path.join(HOOKS_DIR, 'fable-update-check.js'), cmd: hookCmd('fable-update-check.js') };
const VERSION_FILE = path.join(PROFILE_DST_DIR, 'installed-version.json');
const REINJECT = { src: path.join(REPO, 'claude-code/hooks/fable-reinject.sh'), dst: path.join(HOOKS_DIR, 'fable-reinject.sh'), cmd: hookCmd('fable-reinject.sh', false) };
// Out-of-band measurement holdout (opt-in via --with-measure-holdout). The SessionStart hook is INERT unless
// the user exports FABLE_MEASURE=on, so registering it is safe; it never runs by default. See measurement/.
const HOLDOUT = { src: path.join(REPO, 'measurement/holdout.js'), dst: path.join(HOOKS_DIR, 'fable-holdout.js'), cmd: hookCmd('fable-holdout.js') };

// ---- tiny cross-platform shell-free helpers ----
const log = m => process.stdout.write(m + '\n');
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', stdio: opts.capture ? ['ignore', 'pipe', 'ignore'] : 'ignore' });
const mkdirp = d => fs.mkdirSync(d, { recursive: true });
const rmrf = d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const rmf = f => { try { fs.rmSync(f, { force: true }); } catch (_) {} };
const cpR = (src, dst) => { try { fs.cpSync(src, dst, { recursive: true }); } catch (_) {} };
const writeFile = (f, c) => fs.writeFileSync(f, c);
const chmodx = f => { try { fs.chmodSync(f, 0o755); } catch (_) {} };
function symlinkOrCopy(src, dst) { // POSIX: symlink (matches install.sh); Windows / no-priv: copy
  rmf(dst);
  try { if (!isWin) { fs.symlinkSync(src, dst); return; } } catch (_) {}
  try { fs.copyFileSync(src, dst); } catch (_) {}
}
// claude CLI is best-effort: resolve via shell on Windows (claude.cmd), direct on POSIX.
function claude(args) { return spawnSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: isWin, timeout: 15000 }); }
function haveClaude() { const r = claude(['--version']); return !r.error && (r.status === 0 || /\d/.test(r.stdout || '')); }
function claudeMcpHas(name) { const r = claude(['mcp', 'list']); return !r.error && new RegExp(`(^|\\n)\\s*${name}\\b`).test(r.stdout || ''); }

// ---- args ----
const args = process.argv.slice(2);
const has = f => args.includes(f);
let XVERIFY = 'off', XVERIFY_EXPLICIT = 0;
for (const a of args) { if (a === '--with-xverify') { XVERIFY = 'openrouter'; XVERIFY_EXPLICIT = 1; } else if (a.startsWith('--with-xverify=')) { XVERIFY = a.slice('--with-xverify='.length); XVERIFY_EXPLICIT = 1; } }
const WITH_HOOK = has('--with-hook'), SET_STYLE = !has('--no-style'), DO_MCP = !has('--no-mcp');
const DO_SUBAGENT = !has('--no-subagent'), DO_ONBOARD = !has('--no-onboard'), DO_MODELCHK = !has('--no-modelcheck'), WITH_FUSION = has('--with-fusion');
const DO_UPDATECHK = !has('--no-update-check');
const UNINSTALL = has('--uninstall');
// A6 measurement holdout (opt-in) · A7 dry-run · B1 Codex-native path (separate surface; never touches Claude).
const DO_MEASURE_HOLDOUT = has('--with-measure-holdout'), NO_MEASURE_HOLDOUT = has('--no-measure-holdout'), MEASURE_STATUS = has('--measure-status');
const DRY = has('--dry-run'), DRY_JSON = has('--json');
const CODEX_SCOPE = (args.find(a => a.startsWith('--codex-scope=')) || '--codex-scope=user').slice('--codex-scope='.length) || 'user';
const CODEX_INSTALL_REQ = has('--codex-style-only') || has('--codex-full') || has('--codex');
const CODEX_STATUS = has('--codex-status'), CODEX_UNINSTALL = has('--codex-uninstall') || (UNINSTALL && CODEX_INSTALL_REQ);
const KNOWN = new Set(['--with-hook', '--with-fusion', '--with-xverify', '--no-style', '--no-mcp', '--no-subagent', '--no-onboard', '--no-modelcheck', '--no-update-check', '--uninstall', '-h', '--help',
  '--with-measure-holdout', '--no-measure-holdout', '--measure-status', '--dry-run', '--json',
  '--codex', '--codex-full', '--codex-style-only', '--codex-uninstall', '--codex-status',
  '--no-codex-agents', '--no-codex-hooks', '--no-codex-mcp', '--no-codex-skills', '--codex-with-reinject', '--codex-patch-override', '--force-codex-mcp']);
const unknown = args.find(a => !KNOWN.has(a) && !a.startsWith('--with-xverify=') && !a.startsWith('--codex-scope='));
if (has('-h') || has('--help')) {
  log('Fable Profile universal installer.');
  log('  Claude Code:  node install.mjs [--with-hook|--with-fusion|--with-xverify[=preset]|--no-mcp|--no-style|--no-subagent|--no-onboard|--no-modelcheck|--no-update-check|--with-measure-holdout|--uninstall]');
  log('  Codex CLI:    node install.mjs --codex-style-only | --codex-full [--codex-scope=user|project] [--no-codex-agents|--no-codex-hooks|--no-codex-mcp|--no-codex-skills|--codex-with-reinject|--codex-patch-override|--force-codex-mcp]');
  log('  Codex other:  node install.mjs --codex-status | --uninstall --codex');
  log('  Preview:      add --dry-run [--json] to any install/uninstall to print the plan WITHOUT writing anything.');
  process.exit(0);
}
if (unknown) { process.stderr.write(`unknown flag: ${unknown}\n`); process.exit(2); }

// ---- Codex CLI native dispatch (B1) — a separate host surface; returns before any Claude-Code logic runs ----
if (CODEX_STATUS || CODEX_INSTALL_REQ || has('--codex-uninstall')) {
  const { runCodex } = await import(new URL('./codex/lib/codex-install.mjs', import.meta.url));
  const action = CODEX_STATUS ? 'status' : (CODEX_UNINSTALL ? 'uninstall' : 'install');
  const rc = await runCodex({
    action, scope: CODEX_SCOPE === 'project' ? 'project' : 'user', dry: DRY, json: DRY_JSON,
    styleOnly: has('--codex-style-only'),
    parts: { agents: !has('--no-codex-agents'), hooks: !has('--no-codex-hooks'), mcp: !has('--no-codex-mcp'), skills: !has('--no-codex-skills') },
    reinject: has('--codex-with-reinject'), patchOverride: has('--codex-patch-override'), forceMcp: has('--force-codex-mcp'),
    repoDir: REPO, log,
  });
  process.exit(rc || 0);
}

// ---- measurement holdout status (A6) ----
if (MEASURE_STATUS) { await import(new URL('./measurement/status.mjs', import.meta.url)); process.exit(0); }

// ---- dry-run plan for the Claude-Code install/uninstall (A7) ----
if (DRY) { renderClaudePlan(UNINSTALL ? 'uninstall' : 'install'); process.exit(0); }

// ---- uninstall ----
if (UNINSTALL) {
  log('Uninstalling Fable profile...');
  node([MERGE, 'style-off', SETTINGS, 'Fable']);
  node([MERGE, 'hook-off', SETTINGS, REINJECT.cmd]);
  node([MERGE, 'subhook-off', SETTINGS, SUBHOOK.cmd]);
  node([MERGE, 'sesshook-off', SETTINGS, ONBOARD.cmd]);
  node([MERGE, 'sesshook-off', SETTINGS, MODELCHK.cmd]);
  node([MERGE, 'sesshook-off', SETTINGS, UPDATECHK.cmd]);
  node([MERGE, 'sesshook-off', SETTINGS, HOLDOUT.cmd]);
  // The holdout hook file is removed; the measure-ledger.jsonl / measure-outcomes.jsonl campaign data is
  // deliberately LEFT in place (it is the user's measurement result, not install state).
  for (const f of [REINJECT.dst, SUBHOOK.dst, ONBOARD.dst, MODELCHK.dst, UPDATECHK.dst, HOLDOUT.dst, STYLE_DST]) rmf(f);
  for (const f of ['full.md', 'compact.md', 'core.md', 'xverify.json', 'mode.json', 'fable-home', 'onboarded', 'onboard-shown-count', 'model-check.json', 'model-notified.json', 'installed-version.json', 'update-check.json', 'update-notified.json']) rmf(path.join(PROFILE_DST_DIR, f));
  rmrf(RUNTIME_DIR);
  try { fs.rmdirSync(PROFILE_DST_DIR); } catch (_) {}
  if (haveClaude()) { claude(['mcp', 'remove', 'fable-profile', '--scope', 'user']); claude(['mcp', 'remove', 'fable-fusion', '--scope', 'user']); }
  node([MCP_REMOVE, path.join(HOME, '.claude.json'), 'fable-profile', 'fable-fusion']);
  log('Done. Restart Claude Code (or /clear) for the change to take full effect.');
  process.exit(0);
}

// ---- install ----
log(`Installing Fable profile from: ${REPO}  (platform: ${process.platform})`);
mkdirp(HOOKS_DIR); mkdirp(STYLES_DIR); mkdirp(PROFILE_DST_DIR);

// 1) profiles (symlink on POSIX, copy on Windows)
for (const v of ['full', 'compact', 'core']) symlinkOrCopy(path.join(REPO, 'profiles', `${v}.md`), path.join(PROFILE_DST_DIR, `${v}.md`));
log(`  profiles  -> ${PROFILE_DST_DIR}/{full,compact,core}.md`);

// 2) output style = frontmatter header + governor
writeFile(STYLE_DST, fs.readFileSync(path.join(REPO, 'claude-code/output-styles/Fable.header.md')) + fs.readFileSync(path.join(REPO, 'profiles/full.md')));
log(`  style     -> ${STYLE_DST} (generated from profiles/full.md)`);

// 3) set as default
if (SET_STYLE) { node([MERGE, 'style-on', SETTINGS, 'Fable']); log('  style     -> set as default (always-on)'); }
else log("  style     -> not set as default (--no-style); pick 'Fable' in /config");

// 4) SubagentStart hook
fs.copyFileSync(SUBHOOK.src, SUBHOOK.dst); chmodx(SUBHOOK.dst);
if (DO_SUBAGENT) { node([MERGE, 'subhook-on', SETTINGS, SUBHOOK.cmd]); log('  subagent  -> SubagentStart hook registered (reaches every subagent; FABLE_PROFILE=off to disable)'); }
else log('  subagent  -> staged but NOT registered (--no-subagent)');

// 4b) SessionStart hooks
fs.copyFileSync(ONBOARD.src, ONBOARD.dst); chmodx(ONBOARD.dst);
fs.copyFileSync(MODELCHK.src, MODELCHK.dst); chmodx(MODELCHK.dst);
if (DO_ONBOARD) { node([MERGE, 'sesshook-on', SETTINGS, ONBOARD.cmd]); log('  onboard   -> SessionStart hook registered (first run asks your defaults; FABLE_ONBOARD=off or --no-onboard)'); }
else log('  onboard   -> staged but NOT registered (--no-onboard)');
if (DO_MODELCHK) { node([MERGE, 'sesshook-on', SETTINGS, MODELCHK.cmd]); log('  modelchk  -> SessionStart hook registered (daily latest-model check, ~0 tokens; FABLE_MODELCHECK=off or --no-modelcheck)'); }
else log('  modelchk  -> staged but NOT registered (--no-modelcheck)');
fs.copyFileSync(UPDATECHK.src, UPDATECHK.dst); chmodx(UPDATECHK.dst);
if (DO_UPDATECHK) { node([MERGE, 'sesshook-on', SETTINGS, UPDATECHK.cmd]); log('  update    -> SessionStart hook registered (daily ANONYMOUS version check vs GitHub; no key/data; FABLE_UPDATE_CHECK=off or --no-update-check)'); }
else log('  update    -> staged but NOT registered (--no-update-check)');

// 4c) optional out-of-band measurement holdout (A6). Default OFF. The hook is INERT unless FABLE_MEASURE=on,
// so staging+registering it never changes behavior on its own; the off-arm only runs when the user opts into
// a campaign. NEVER default-on: the off arm runs ~1/5 sessions untreated. (measurement/README.md)
fs.copyFileSync(HOLDOUT.src, HOLDOUT.dst); chmodx(HOLDOUT.dst);
if (DO_MEASURE_HOLDOUT) { node([MERGE, 'sesshook-on', SETTINGS, HOLDOUT.cmd]); log('  measure   -> holdout SessionStart hook registered (INERT unless FABLE_MEASURE=on; off-arm runs ~1/5 sessions untreated). Campaign guide: measurement/README.md'); }
else if (NO_MEASURE_HOLDOUT) { node([MERGE, 'sesshook-off', SETTINGS, HOLDOUT.cmd]); rmf(HOLDOUT.dst); log('  measure   -> holdout hook removed (--no-measure-holdout)'); }
else log('  measure   -> holdout staged but NOT registered (opt-in: re-run with --with-measure-holdout; never default-on by design)');

// 5) opt-in per-turn reinject hook (bash; POSIX only)
if (isWin) {
  if (WITH_HOOK) log('  hook      -> SKIPPED: the per-turn reinject hook is a bash script (POSIX only). The SubagentStart + SessionStart Node hooks cover the main reach on Windows.');
} else {
  fs.copyFileSync(REINJECT.src, REINJECT.dst); chmodx(REINJECT.dst);
  if (WITH_HOOK) { node([MERGE, 'hook-on', SETTINGS, REINJECT.cmd]); log('  hook      -> installed + registered (per-turn core re-injection; FABLE_PROFILE=off to disable)'); }
  else log('  hook      -> staged but NOT registered (re-run with --with-hook to enable)');
}

// 4.5) immutable runtime copy (servers + profiles + orchestration + docs) so hooks/MCP resolve from any cwd
if (DO_MCP || WITH_FUSION || DO_ONBOARD || DO_MODELCHK || DO_UPDATECHK) {
  rmrf(RUNTIME_DIR); mkdirp(RUNTIME_DIR);
  for (const d of ['mcp', 'fusion', 'profiles', 'orchestration', 'docs']) cpR(path.join(REPO, d), path.join(RUNTIME_DIR, d));
  writeFile(FABLE_HOME_PTR, RUNTIME_DIR + '\n');
  log(`  runtime   -> copied to ${RUNTIME_DIR} (immutable; incl. orchestration/ for the SessionStart hooks)`);
}

// record the installed version (commit sha + repo url + clone path) so the update-check hook can compare
// against the public repo. Best-effort: if this isn't a git clone, sha stays '' and the check no-ops.
const git = a => { const r = spawnSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return (r.status === 0 && r.stdout) ? r.stdout.trim() : ''; };
const normUrl = u => { u = (u || '').trim(); if (u.startsWith('git@github.com:')) u = 'https://github.com/' + u.slice('git@github.com:'.length); return u.replace(/\.git$/, ''); };
writeFile(VERSION_FILE, JSON.stringify({ sha: git(['rev-parse', 'HEAD']), repo_url: normUrl(git(['config', '--get', 'remote.origin.url'])) || 'https://github.com/elon-choo/fablever', source_dir: REPO }, null, 2) + '\n');

// 5b) register MCP (best-effort; print the command if claude is absent or it fails)
function registerMcp(name, server, extra) {
  if (!DO_MCP && name === 'fable-profile') return;
  if (haveClaude()) {
    if (claudeMcpHas(name)) { log(`  ${name === 'fable-profile' ? 'mcp     ' : 'fusion  '}  -> already registered`); return; }
    const r = claude(['mcp', 'add', '--transport', 'stdio', name, '--scope', 'user', '--', 'node', server]);
    if (!r.error && r.status === 0) log(`  ${name === 'fable-profile' ? 'mcp     ' : 'fusion  '}  -> registered (scope: user)${extra ? ' ' + extra : ''}`);
    else log(`  ${name}  -> WARN: 'claude mcp add' failed; run manually:\n               claude mcp add --transport stdio ${name} --scope user -- node "${server}"`);
  } else {
    log(`  ${name}  -> 'claude' CLI not found; add manually:\n               claude mcp add --transport stdio ${name} --scope user -- node "${server}"`);
  }
}
if (DO_MCP) registerMcp('fable-profile', MCP_SERVER);
if (WITH_FUSION) registerMcp('fable-fusion', FUSION_SERVER, '(needs OPENROUTER_API_KEY; FABLE_FUSION=off to disable)');

// 7) cross-model preset (preserve an existing choice on a plain re-run)
const PRESET_ALIAS = { off: 'claude-only', 'claude-only': 'claude-only', codex: 'gpt-oauth', 'gpt-oauth': 'gpt-oauth', openrouter: 'gpt-api+gemini-api', 'gpt-api+gemini-api': 'gpt-api+gemini-api', 'gpt-oauth+gemini-api': 'gpt-oauth+gemini-api' };
let PRESET = PRESET_ALIAS[XVERIFY] || 'claude-only';
if (XVERIFY_EXPLICIT || !fs.existsSync(XVERIFY_CFG)) {
  const r = node([XVPRESET, 'set', PRESET]);
  if (r.status === 0) log(`  xverify   -> preset '${PRESET}' -> ${XVERIFY_CFG}  (change later: node orchestration/lib/xverify-preset.mjs set <preset>)`);
  else { writeFile(XVERIFY_CFG, '{ "preset": "claude-only", "mode": "off" }\n'); log('  xverify   -> claude-only (fallback)'); }
} else {
  const r = node([XVPRESET, 'current'], { capture: true });
  const keep = (r.stdout || '').trim() || '?';
  log(`  xverify   -> kept your existing preset '${keep}' (re-run with --with-xverify=<preset> to change)`);
  PRESET = keep;
}
if (!fs.existsSync(MODE_CFG)) { writeFile(MODE_CFG, '{ "ultra": "auto" }\n'); log(`  mode      -> ${MODE_CFG} seeded {"ultra":"auto"}  (change: export FABLE_ULTRA=on|off|auto)`); }
if (XVERIFY_EXPLICIT) {
  if (PRESET === 'gpt-api+gemini-api') { if (WITH_FUSION || haveClaude()) registerMcp('fable-fusion', FUSION_SERVER, '(hosts fable_cross_verify)'); log('  xverify   -> NOTE: set OPENROUTER_API_KEY in your shell rc (never paste a key into chat).'); }
  else if (PRESET === 'gpt-oauth') log('  xverify   -> GPT reviewer via ChatGPT login (NO API key). Setup (3 cmds): npm i -g @openai/codex  &&  codex login  &&  claude mcp add --transport stdio codex --scope user -- codex mcp-server   (details: docs/API-KEYS.md § Set up the codex MCP)');
  else if (PRESET === 'gpt-oauth+gemini-api') log('  xverify   -> NOTE: GPT via codex MCP (docs/API-KEYS.md § Set up the codex MCP) + set GEMINI_API_KEY in your shell rc.');
}

// localized post-install handoff (cross-platform locale detection: env, else Intl)
function detectLang() {
  const env = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '').split('.')[0].split('_')[0].toLowerCase();
  if (env) return env;
  try { return (Intl.DateTimeFormat().resolvedOptions().locale || '').split('-')[0].toLowerCase(); } catch { return ''; }
}
const HANDOFF = {
  ko: '\n✅ 설치 완료. Claude Code를 재시작하세요(또는 /clear).\n   첫 세션에서 fablever가 간단한 설정 질문 2개를 물어봅니다. 그냥 "skip"이라고 답하면\n   안전한 기본값으로 시작됩니다 — API 키가 필요 없고 추가 비용도 없습니다.\n   (아래 영어 안내는 참고용입니다. 한국어 백서: whitepaper/ko/)',
  ja: '\n✅ インストール完了。Claude Code を再起動してください（または /clear）。\n   最初のセッションで fablever が簡単な設定の質問を2つします。「skip」と答えれば\n   安全な初期設定で始まります — APIキーは不要で、追加費用もありません。\n   （以下の英語は参考用の詳細です。）',
  zh: '\n✅ 安装完成。请重启 Claude Code（或 /clear）。\n   首次会话中 fablever 会问你两个简单的设置问题。直接回答 "skip"\n   即可使用安全的默认设置 — 无需 API 密钥，也不产生额外费用。\n   （下面的英文为参考详情。）',
  es: '\n✅ Instalación completa. Reinicia Claude Code (o /clear).\n   En tu primera sesión, fablever te hará 2 preguntas rápidas. Responde "skip"\n   para los valores por defecto seguros — sin clave API y sin coste adicional.\n   (Los detalles en inglés siguen abajo.)',
  fr: '\n✅ Installation terminée. Redémarre Claude Code (ou /clear).\n   Lors de ta première session, fablever te posera 2 questions rapides.\n   Réponds « skip » pour les réglages par défaut sûrs — sans clé API ni coût.\n   (Les détails en anglais suivent ci-dessous.)',
  de: '\n✅ Installation abgeschlossen. Starte Claude Code neu (oder /clear).\n   In deiner ersten Sitzung stellt fablever 2 kurze Fragen. Antworte mit "skip"\n   für die sicheren Standardwerte — kein API-Schlüssel, keine Zusatzkosten.\n   (Englische Details folgen unten.)',
  pt: '\n✅ Instalação concluída. Reinicie o Claude Code (ou /clear).\n   Na sua primeira sessão, o fablever fará 2 perguntas rápidas. Responda "skip"\n   para os padrões seguros — sem chave de API e sem custo adicional.\n   (Os detalhes em inglês seguem abaixo.)',
};
const block = HANDOFF[detectLang()];
if (block) log(block);

log(`\nInstalled.  Next: RESTART Claude Code (or run /clear).\n
  >> First time? Just restart and start working normally. On your first session, fablever will
     ASK YOU two quick setup questions (cost mode, and whether to add a cross-model reviewer) and
     save your answers — no config files to edit by hand. New to AI/API keys? The default needs
     NO key and costs nothing extra. Say "skip" to take the recommended defaults.

  Always-on:   the Fable working style layers onto every session, project, and subagent.
  Cost dial:   FABLE_ULTRA=auto (default: cheap; spends only on high-stakes reviews) | on | off.
  Verify:      /config -> Output style shows "Fable"; /mcp lists fable-profile.
  Full guide:  whitepaper/09-running-it.md  (keys, login, modes, kill switches).
  Quiet hooks: export FABLE_PROFILE=off   (the always-on STYLE stays; switch it in /config to drop it)
  Remove all:  node install.mjs --uninstall   (restores your prior output style + settings)

  This is a STYLE transplant, not a capability transplant: it recovers Fable's restraint,
  decisiveness, outcome-first communication, anti-fabrication and stop-when-done discipline.
  It cannot raise a weaker model's reasoning ceiling — that lives in the weights.`);

// One-time, human-only star nudge. Shown ONLY on an interactive terminal (not when an agent or CI
// runs the installer with stdout captured/piped), so it costs zero tokens in agent-run installs and
// never enters a session. fablever asks for a star nowhere in the runtime — only here, once.
if (process.stdout.isTTY && !process.env.CI) {
  log('\n  If fablever earns its place on your machine, a ⭐ helps others find it:');
  log('    https://github.com/elon-choo/fablever   (shown once, here in your terminal — never in a session, never a token)');
}

// ---- A7: dry-run plan for the Claude-Code install/uninstall (read-only; never writes) -------------------
// Function declaration (hoisted) so the early `if (DRY)` dispatch can call it. It derives the plan from the
// SAME flag consts the real install uses, but performs NO mutation.
function renderClaudePlan(action) {
  const styleOnly = !DO_MCP && !DO_SUBAGENT && !DO_ONBOARD && !DO_MODELCHK && !DO_UPDATECHK;
  const aliasMap = { off: 'claude-only', 'claude-only': 'claude-only', codex: 'gpt-oauth', 'gpt-oauth': 'gpt-oauth', openrouter: 'gpt-api+gemini-api', 'gpt-api+gemini-api': 'gpt-api+gemini-api', 'gpt-oauth+gemini-api': 'gpt-oauth+gemini-api' };
  const xv = (() => { try { return JSON.parse(fs.readFileSync(XVERIFY_CFG, 'utf8')); } catch { return null; } })();
  const preset = XVERIFY_EXPLICIT ? (aliasMap[XVERIFY] || XVERIFY) : ((xv && xv.preset) || 'claude-only');
  const externalVerify = preset === 'claude-only' ? 'off (claude-only — same-family panel; no cross-model)' : `${preset} (cross-model reviewer; needs a key/login — opt-in)`;

  if (action === 'uninstall') {
    const plan = {
      host: 'claude-code', mode: 'uninstall',
      removes: [STYLE_DST, `${SETTINGS} (outputStyle restored to prior; fablever hooks removed)`, RUNTIME_DIR,
        SUBHOOK.dst, ONBOARD.dst, MODELCHK.dst, UPDATECHK.dst, REINJECT.dst, HOLDOUT.dst, `${PROFILE_DST_DIR}/{full,compact,core}.md`, XVERIFY_CFG, MODE_CFG, VERSION_FILE],
      mcp_removed: ['fable-profile', 'fable-fusion'],
      preserved: ['measure-ledger.jsonl / measure-outcomes.jsonl (your measurement campaign data)', 'every non-fablever hook, permission, and setting in settings.json'],
      network: 'none', credential: 'none',
      note: 'settings.json is backed up before edit and restored deep-equal to its pre-install state (verified by test/install-matrix.mjs: 140/140).',
    };
    if (DRY_JSON) { log(JSON.stringify(plan, null, 2)); return; }
    log('\n[dry-run] fablever Claude-Code UNINSTALL plan');
    log('\nRemove:'); for (const x of plan.removes) log('  • ' + x);
    log('\nMCP removed:        ' + plan.mcp_removed.join(', '));
    log('Preserved:'); for (const x of plan.preserved) log('  • ' + x);
    log('\nNetwork behavior:   ' + plan.network);
    log('Credential behavior: ' + plan.credential);
    log('\nNote: ' + plan.note);
    log('\n[dry-run] No files were written.');
    return;
  }

  const creates = [STYLE_DST, `${PROFILE_DST_DIR}/{full,compact,core}.md`, MODE_CFG, XVERIFY_CFG, VERSION_FILE];
  const modifies = [`${SETTINGS} (outputStyle${SET_STYLE ? '=Fable' : ' unchanged (--no-style)'} + hook entries; backed up first)`];
  const hooks = [];
  if (DO_SUBAGENT) hooks.push('SubagentStart → fable-subagent.js');
  if (DO_ONBOARD) hooks.push('SessionStart → fable-onboard.js');
  if (DO_MODELCHK) hooks.push('SessionStart → fable-model-check.js');
  if (DO_UPDATECHK) hooks.push('SessionStart → fable-update-check.js');
  if (WITH_HOOK && !isWin) hooks.push('UserPromptSubmit → fable-reinject.sh (opt-in)');
  if (DO_MEASURE_HOLDOUT) hooks.push('SessionStart → fable-holdout.js (INERT unless FABLE_MEASURE=on)');
  const mcp = [];
  if (DO_MCP) mcp.push('fable-profile (node mcp/src/server.js, scope user)');
  if (WITH_FUSION) mcp.push('fable-fusion (needs OPENROUTER_API_KEY)');
  if (DO_MCP || WITH_FUSION || DO_ONBOARD || DO_MODELCHK || DO_UPDATECHK) creates.push(`${RUNTIME_DIR}/ (immutable runtime: mcp + fusion + profiles + orchestration + docs)`);

  const networkBits = [];
  if (DO_UPDATECHK) networkBits.push('anonymous `git ls-remote HEAD` once/24h (no key, no code, no data)');
  if (WITH_FUSION) networkBits.push('Fusion MCP calls OpenRouter with YOUR key (opt-in)');
  if (preset !== 'claude-only') networkBits.push('xverify sends review artifacts to a cross-model reviewer (opt-in)');
  const credentialBits = [];
  if (WITH_FUSION) credentialBits.push('OPENROUTER_API_KEY (read from env by the Fusion MCP only)');
  if (preset !== 'claude-only' && preset !== 'gpt-oauth') credentialBits.push('a provider API key for xverify (read from env only)');

  const risk = styleOnly
    ? 'minimal — always-on output style only. No hooks, no MCP, no network, no credentials.'
    : (WITH_FUSION || preset !== 'claude-only')
      ? 'elevated — you enabled a key/network feature (fusion/xverify). Reads a key from your env and makes cross-model calls on opt-in paths.'
      : 'low — default install: local hooks + a local stdio MCP. The only network is the anonymous daily version check; reads zero credentials.';

  const plan = {
    host: 'claude-code', mode: styleOnly ? 'style-only' : (WITH_FUSION ? 'default+fusion' : 'default'),
    creates, modifies, hooks, mcp,
    network: networkBits.length ? networkBits.join('; ') : 'none',
    credential: credentialBits.length ? credentialBits.join('; ') : 'none — the default install reads no credentials.',
    update_check: DO_UPDATECHK ? 'ON (anonymous daily version check; FABLE_UPDATE_CHECK=off to disable)' : 'OFF (--no-update-check)',
    external_verification: externalVerify,
    uninstall: 'node install.mjs --uninstall',
    risk,
  };
  if (DRY_JSON) { log(JSON.stringify(plan, null, 2)); return; }
  log(`\n[dry-run] fablever Claude-Code install plan — mode=${plan.mode}`);
  const list = (label, arr) => { if (arr && arr.length) { log(`\n${label}:`); for (const x of arr) log('  • ' + x); } };
  list('Create', creates); list('Modify', modifies); list('Hook registration', hooks); list('MCP registration', mcp);
  log('\nNetwork behavior:        ' + plan.network);
  log('Credential behavior:     ' + plan.credential);
  log('Update check:            ' + plan.update_check);
  log('External verification:   ' + plan.external_verification);
  log('Install risk level:      ' + plan.risk);
  log('Uninstall:               ' + plan.uninstall);
  log('\n[dry-run] No files were written. Re-run without --dry-run to apply.');
}
