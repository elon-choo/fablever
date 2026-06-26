#!/usr/bin/env node
// tools/fable-doctor.mjs — read-only diagnostic: what is installed, on which host, and the safe next step.
//
// Reports the fablever install state for Claude Code (~/.claude) and Codex CLI (CODEX_HOME / $HOME/.agents)
// and a recommended next action. Read-only: it writes nothing and — load-bearing — never reads, stores, or
// prints any API key or Codex/ChatGPT auth token (it does not open auth.json or any *_API_KEY value).
// Zero dependencies (Node built-ins only).
//
//   node tools/fable-doctor.mjs            human-readable report
//   node tools/fable-doctor.mjs --json     machine-readable JSON
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from '../codex/lib/paths.mjs';
import { hasBlock, AGENTS_START, AGENTS_END, TOML_START, TOML_END, HOOK_STATUS_PREFIX } from '../codex/lib/markers.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = (process.env.HOME || process.env.USERPROFILE || os.homedir());
const JSON_OUT = process.argv.includes('--json');

const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const rj = p => { try { return JSON.parse(read(p)); } catch { return null; } };
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };
const lsdirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };

// ---- repo health (no secrets) ----------------------------------------------------------------------------
const pkg = rj(path.join(REPO, 'package.json')) || {};
const depCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;

// ---- Claude Code install state (~/.claude) ---------------------------------------------------------------
function claudeState() {
  const dir = path.join(HOME, '.claude');
  const settings = rj(path.join(dir, 'settings.json')) || {};
  const styleActive = settings.outputStyle === 'Fable';
  const styleFile = lsdirs(path.join(dir, 'output-styles')).length || exists(path.join(dir, 'output-styles', 'Fable.md'));
  // fablever hooks = hook entries whose command path points into ~/.claude/hooks/fable-*
  const hookNames = new Set();
  const hooks = settings.hooks || {};
  for (const ev of Object.keys(hooks)) for (const e of (hooks[ev] || [])) for (const h of (e.hooks || [])) {
    const c = String(h.command || '');
    const m = c.match(/fable-([a-z-]+?)(?:\.[a-z]+)?["']?\s*$/i);
    if (/[\/\\]\.claude[\/\\]hooks[\/\\]fable-/.test(c) || (m && /fable-/.test(c))) hookNames.add(m ? `fable-${m[1]}` : 'fable-hook');
  }
  // MCP registration lives in ~/.claude.json (mcpServers)
  const claudeJson = rj(path.join(HOME, '.claude.json')) || {};
  const mcp = claudeJson.mcpServers || {};
  const installed = styleActive || exists(path.join(dir, 'settings.json'));
  return {
    host: 'claude-code',
    config_dir: dir,
    output_style_active: styleActive,
    output_style_file_present: !!styleFile,
    hooks: [...hookNames].sort(),
    update_check_hook: [...hookNames].some(h => /update/.test(h)),
    measure_holdout_hook: [...hookNames].some(h => /holdout|measure/.test(h)),
    mcp_fable_profile: !!mcp['fable-profile'],
    mcp_fable_fusion: !!mcp['fable-fusion'],
    runtime_present: exists(path.join(dir, 'fable-profile')),
    any_install_detected: installed && (styleActive || hookNames.size > 0 || !!mcp['fable-profile']),
  };
}

// ---- Codex install state (user scope) --------------------------------------------------------------------
function codexState() {
  const P = resolvePaths('user', { env: process.env });
  const agents = exists(P.agents) && hasBlock(read(P.agents), AGENTS_START, AGENTS_END);
  const override = exists(P.agentsOverride) && hasBlock(read(P.agentsOverride), AGENTS_START, AGENTS_END);
  let hooksReg = [];
  try { const h = rj(P.hooksJson) || {}; for (const ev of Object.keys(h.hooks || {})) if ((h.hooks[ev] || []).some(e => (e.hooks || []).some(x => String(x.statusMessage || '').startsWith(HOOK_STATUS_PREFIX) || String(x.command || '').includes(P.hooksDir)))) hooksReg.push(ev); } catch {}
  const mcp = exists(P.configToml) && hasBlock(read(P.configToml), TOML_START, TOML_END);
  const skills = lsdirs(P.agentsSkillsDir).filter(n => n.startsWith('fable-') && exists(path.join(P.agentsSkillsDir, n, 'SKILL.md')));
  return {
    host: 'codex',
    codex_home: P.CODEX_HOME,
    agents_guidance_active: agents || override,
    hooks_registered: hooksReg,
    mcp_config_present: mcp,
    skills_installed: skills,
    skills_dir: P.agentsSkillsDir,
    any_install_detected: (agents || override || hooksReg.length > 0 || mcp || skills.length > 0),
    note: 'user scope only — for a project install, run: node install.mjs --codex-status --codex-scope=project',
  };
}

// ---- recommendation --------------------------------------------------------------------------------------
function recommend(cl, cx) {
  if (!cl.any_install_detected && !cx.any_install_detected) {
    return 'No fablever install detected. Safest first step — Claude Code: `node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp` (style-only). Codex CLI: `node install.mjs --codex-style-only`. Preview either with `--dry-run`.';
  }
  const tips = [];
  if (cl.output_style_active && !cl.mcp_fable_profile) tips.push('Claude: style is active but the fable_check / fable_lint MCP is not registered — add it with `node install.mjs` (default) if you want the delivery gate.');
  if (cx.any_install_detected && !cx.skills_installed.length && cx.mcp_config_present) tips.push('Codex: MCP is set but no skills are installed — re-run `node install.mjs --codex-full` to add the on-demand fable-* skills.');
  if (!cx.any_install_detected) tips.push('Codex CLI not set up — `node install.mjs --codex-style-only` for the AGENTS-only layer (no key, fully reversible).');
  tips.push('Preview any change with `--dry-run`; uninstall fully with `node install.mjs --uninstall` (Claude) or `node install.mjs --uninstall --codex` (Codex).');
  return tips.join(' ');
}

const cl = claudeState(), cx = codexState();
const hostSummary = cl.any_install_detected && cx.any_install_detected ? 'both' : cl.any_install_detected ? 'claude-code' : cx.any_install_detected ? 'codex' : 'none';
const report = {
  fablever_version: pkg.version || 'unknown',
  dependencies: depCount === 0 ? 'none ({} — zero supply-chain surface)' : `${depCount} (UNEXPECTED — fablever ships zero deps)`,
  host_detected: hostSummary,
  external_verification: 'off by default (xverify/fusion are opt-in and need an API key; this tool does not enable or inspect them)',
  credentials: 'not inspected — fablever never reads API keys or Codex/ChatGPT auth tokens',
  claude: cl,
  codex: cx,
  recommended_next_action: recommend(cl, cx),
};

if (JSON_OUT) { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exit(0); }

const yn = b => b ? 'yes' : 'no';
console.log(`fablever doctor — v${report.fablever_version}  ·  dependencies: ${report.dependencies}`);
console.log(`Host detected:           ${report.host_detected}`);
console.log('');
console.log('Claude Code (~/.claude):');
console.log(`  output style "Fable":  ${yn(cl.output_style_active)}`);
console.log(`  hooks:                 ${cl.hooks.length ? cl.hooks.join(', ') : 'none'}`);
console.log(`  MCP fable-profile:     ${yn(cl.mcp_fable_profile)}    fable-fusion: ${yn(cl.mcp_fable_fusion)}`);
console.log(`  daily update check:    ${yn(cl.update_check_hook)}    measurement holdout: ${yn(cl.measure_holdout_hook)}`);
console.log('');
console.log(`Codex CLI (${cx.codex_home}):`);
console.log(`  AGENTS guidance:       ${yn(cx.agents_guidance_active)}`);
console.log(`  hooks registered:      ${cx.hooks_registered.length ? cx.hooks_registered.join(', ') : 'none'}`);
console.log(`  MCP config present:    ${yn(cx.mcp_config_present)}`);
console.log(`  skills installed:      ${cx.skills_installed.length ? cx.skills_installed.join(', ') : 'none'}`);
console.log(`  (${cx.note})`);
console.log('');
console.log(`External verification:   ${report.external_verification}`);
console.log(`Credentials:             ${report.credentials}`);
console.log('');
console.log('Recommended next action:');
console.log(`  ${report.recommended_next_action}`);
process.exit(0);
