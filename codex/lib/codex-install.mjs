// codex/lib/codex-install.mjs — Codex CLI native install / uninstall / status / dry-run for fablever.
//
// Codex has no Claude-Code output-style surface. The equivalent surfaces are:
//   • AGENTS.md          — the always-on instruction layer (style-only install writes ONLY this)
//   • hooks.json         — SessionStart / SubagentStart (+ optional UserPromptSubmit) lifecycle hooks
//   • config.toml        — MCP server registration (reuses the same zero-dep mcp/src/server.js)
//
// Everything is marker-based and reversible: AGENTS.md / config.toml get a delimited fablever block,
// hooks.json gets entries tagged by an absolute command path + statusMessage prefix, and uninstall removes
// ONLY those. The reversibility GUARANTEE is the marker reconstruction itself (upsert/removeBlock operate on
// the live file, so uninstall restores the original regardless of whether a backup exists); each edit is
// ALSO backed up first as defense-in-depth, best-effort — if a backup cannot be written, backup() warns to
// stderr rather than failing silently, and the edit still proceeds (it is marker-based and reversible).
// fablever NEVER reads, stores, or prints a Codex auth token (auth.json / CODEX_ACCESS_TOKEN); ChatGPT/OAuth
// login is wholly managed by Codex.
//
// Zero dependencies (Node built-ins only). Imported by install.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolvePaths } from './paths.mjs';
import {
  AGENTS_START, AGENTS_END, TOML_START, TOML_END, HOOK_STATUS_PREFIX,
  hasBlock, upsertBlock, removeBlock, stripTomlTable, addHookEntry, removeFableEntries,
} from './markers.mjs';

const isWin = process.platform === 'win32';
const ts = () => process.env.FABLE_TS || String(process.hrtime.bigint());

// ---- tiny fs helpers (mirroring install.mjs conventions) ----
const exists = p => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const readFile = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const mkdirp = d => fs.mkdirSync(d, { recursive: true });
const rmrf = d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };
const rmf = f => { try { fs.rmSync(f, { force: true }); } catch (_) {} };
const cpR = (src, dst) => { try { fs.cpSync(src, dst, { recursive: true }); } catch (_) {} };
const chmodx = f => { try { fs.chmodSync(f, 0o755); } catch (_) {} };
// Skills are plain directories under .agents/skills/, each containing a SKILL.md. A skill dir is "ours"
// only if it is named fable-* AND carries a SKILL.md — both conditions, so uninstall can never touch a
// user-authored skill that merely shares the folder.
function listSkillNames(srcDir) {
  try {
    return fs.readdirSync(srcDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('fable-') && exists(path.join(srcDir, d.name, 'SKILL.md')))
      .map(d => d.name).sort();
  } catch { return []; }
}
function backup(file, plan) {
  if (!exists(file)) return null;
  const bak = `${file}.fable-bak-${ts()}`;
  try { fs.copyFileSync(file, bak); plan && plan.backups.push(bak); return bak; }
  catch (e) {
    // The marker-based reconstruction (upsert/removeBlock on the LIVE file) is the actual reversibility
    // mechanism — the backup is defense-in-depth. But a backup that fails must not fail SILENTLY: warn so
    // the user knows there is no extra recovery copy for this specific edit.
    try { process.stderr.write(`[fablever] WARNING: could not write a backup of ${file} before editing it (${e.message}). The edit is still marker-based and reversible via uninstall; just no extra .fable-bak copy was saved.\n`); } catch (_) {}
    return null;
  }
}
function writeFileLogged(file, content, plan, kind) {
  const existed = exists(file);
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content);
  if (plan) (existed ? plan.modifies : plan.creates).push(file);
  return existed;
}

// codex CLI presence is best-effort and NEVER touches auth. We only ever ask for --version / mcp --help.
function codexBin() {
  try { const r = spawnSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: isWin, timeout: 8000 }); return (!r.error && (r.status === 0 || /\d/.test(r.stdout || ''))) ? (r.stdout || '').trim() : ''; } catch { return ''; }
}
function codexMcpHelp() {
  try { const r = spawnSync('codex', ['mcp', '--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: isWin, timeout: 8000 }); return !r.error && (r.status === 0); } catch { return false; }
}

// ---- hook command strings -------------------------------------------------------------------------------
const toWin = p => p.replace(/\//g, '\\');
const hookCommand = abs => `node "${abs}"`;
function hookEntry(event, hookFile, matcher, statusMessage) {
  const inner = { type: 'command', command: hookCommand(hookFile), commandWindows: `node "${toWin(hookFile)}"`, timeout: 10, statusMessage };
  const entry = { hooks: [inner] };
  if (matcher) entry.matcher = matcher;
  return entry;
}

// ---- the config.toml MCP marker block -------------------------------------------------------------------
function tomlBlock(P) {
  const a = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); // TOML basic-string escape
  return [
    TOML_START,
    '[mcp_servers.fable-profile]',
    'command = "node"',
    `args = ["${a(P.mcpServer)}"]`,
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 60',
    'enabled = true',
    'default_tools_approval_mode = "prompt"',
    '',
    '[mcp_servers.fable-profile.env]',
    'FABLE_HOST = "codex"',
    `FABLE_PROFILE_HOME = "${a(P.profileHome)}"`,
    `FABLE_HOME = "${a(P.runtime)}"`,
    `FABLE_TASTE_FILE = "${a(P.tasteFile)}"`,
    TOML_END,
  ].join('\n');
}
// A bare [mcp_servers.fable-profile] table OUTSIDE our marker = a pre-existing user/other registration.
function hasForeignMcpTable(tomlText) {
  const c = String(tomlText || '');
  const insideMarker = hasBlock(c, TOML_START, TOML_END)
    ? c.slice(c.indexOf(TOML_START), c.indexOf(TOML_END) + TOML_END.length) : '';
  const outside = insideMarker ? c.replace(insideMarker, '') : c;
  return /(^|\n)\s*\[mcp_servers\.fable-profile\]/.test(outside);
}

// ---- resolve every decision ONCE, so dry-run and execute can't drift --------------------------------------
function resolve(opts) {
  const scope = opts.scope === 'project' ? 'project' : 'user';
  const P = resolvePaths(scope, { env: opts.env || process.env, cwd: opts.cwd || process.cwd() });
  const repo = opts.repoDir;
  const parts = opts.parts || { agents: true, hooks: true, mcp: true };
  const styleOnly = !!opts.styleOnly;
  const doAgents = parts.agents !== false;
  const doHooks = !styleOnly && parts.hooks !== false;
  const doMcp = !styleOnly && parts.mcp !== false;
  const doReinject = !!opts.reinject && doHooks;
  // Codex Agent Skills: on-demand SKILL.md files copied into the Codex discovery dir (.agents/skills).
  // Part of full install (opt out with --no-codex-skills); never part of style-only.
  const doSkills = !styleOnly && parts.skills !== false;
  const skillsSrc = path.join(repo, '.agents', 'skills');
  const skillsDst = P.agentsSkillsDir;
  const skillNames = listSkillNames(skillsSrc);
  // Running project-scope install from inside the fablever repo itself would copy .agents/skills onto
  // itself — they are already discoverable there, so we skip the copy and never delete them on uninstall.
  const skillsSelf = path.resolve(skillsSrc) === path.resolve(skillsDst);

  // AGENTS target: override file only with explicit --codex-patch-override; otherwise the plain AGENTS.md.
  const overrideExists = exists(P.agentsOverride);
  const patchOverride = !!opts.patchOverride;
  const agentsTarget = (overrideExists && patchOverride) ? P.agentsOverride : P.agents;
  const agentsSkippedByOverride = overrideExists && !patchOverride; // override shadows AGENTS.md → skip+warn

  const hookFiles = {
    session: path.join(P.hooksDir, 'fable-session.js'),
    subagent: path.join(P.hooksDir, 'fable-subagent.js'),
    reinject: path.join(P.hooksDir, 'fable-reinject.js'),
  };
  const tomlConflict = doMcp && hasForeignMcpTable(readFile(P.configToml)) && !opts.forceMcp;

  return { scope, P, repo, styleOnly, doAgents, doHooks, doMcp, doReinject,
    doSkills, skillsSrc, skillsDst, skillNames, skillsSelf,
    overrideExists, patchOverride, agentsTarget, agentsSkippedByOverride, hookFiles, tomlConflict, opts };
}

// ---- the dry-run plan (read-only) -----------------------------------------------------------------------
function computePlan(R) {
  const { P } = R;
  const plan = {
    host: 'codex', scope: R.scope, mode: R.styleOnly ? 'codex-style-only' : 'codex-full',
    creates: [], modifies: [], backups: [], hooks: [], mcp: [], warnings: [], notes: [],
    network: 'none — Codex-native install writes only local files; the fable-profile MCP runs locally over stdio (no network).',
    credential: 'none — fablever never reads/stores/prints Codex auth (auth.json, CODEX_ACCESS_TOKEN). ChatGPT/OAuth login is managed by Codex.',
    update_check: 'n/a — the Codex install registers no version-check hook.',
    external_verification: 'off — Codex-native install does not enable cross-model xverify (that lives in the Claude path / Fusion). A Codex host verifying itself is not cross-model.',
    uninstall: `node install.mjs --uninstall --codex${R.scope === 'project' ? ' --codex-scope=project' : ''}`,
    risk: R.styleOnly
      ? 'minimal — a single marker block in AGENTS.md (instruction text only). No hooks, no MCP, no network, no credentials.'
      : 'low — adds local zero-dependency hooks + a local stdio MCP. Marker-based and reversible; zero network, zero credential reads. Codex requires you to trust the hooks (/hooks) and confirm the MCP (/mcp).',
  };
  if (R.doAgents) {
    if (R.agentsSkippedByOverride) {
      plan.warnings.push(`AGENTS.override.md exists (${P.agentsOverride}) and overrides AGENTS.md at this scope. SKIPPING AGENTS.md — re-run with --codex-patch-override to patch the override instead, or remove it.`);
    } else {
      (exists(R.agentsTarget) ? plan.modifies : plan.creates).push(`${R.agentsTarget}  (fablever marker block)`);
      if (exists(R.agentsTarget)) plan.backups.push(`${R.agentsTarget}.fable-bak-<ts>`);
    }
  }
  if (R.doHooks) {
    plan.creates.push(R.hookFiles.session, R.hookFiles.subagent);
    if (R.doReinject) plan.creates.push(R.hookFiles.reinject);
    if (exists(P.hooksJson)) plan.backups.push(`${P.hooksJson}.fable-bak-<ts>`);
    plan.hooks.push('SessionStart  → fable-session.js   (matcher: startup|clear)');
    plan.hooks.push('SubagentStart → fable-subagent.js  (matcher: *)');
    if (R.doReinject) plan.hooks.push('UserPromptSubmit → fable-reinject.js  (opt-in, per-turn)');
    (exists(P.hooksJson) ? plan.modifies : plan.creates).push(`${P.hooksJson}  (fablever entries)`);
    plan.notes.push('After install, open Codex and run /hooks to review and TRUST the new fablever hooks (untrusted command hooks do not run).');
  }
  if (R.doMcp) {
    plan.creates.push(`${P.runtime}/  (immutable runtime copy: mcp + profiles + orchestration + docs)`);
    if (R.tomlConflict) {
      plan.warnings.push(`config.toml already has an [mcp_servers.fable-profile] table OUTSIDE the fablever marker (${P.configToml}). SKIPPING MCP registration — re-run with --force-codex-mcp to overwrite with the fablever marker block.`);
    } else {
      (exists(P.configToml) ? plan.modifies : plan.creates).push(`${P.configToml}  (fablever:codex:mcp marker block)`);
      if (exists(P.configToml)) plan.backups.push(`${P.configToml}.fable-bak-<ts>`);
      plan.mcp.push('fable-profile  → node ' + P.mcpServer + '  (env: FABLE_HOST=codex, FABLE_PROFILE_HOME, FABLE_HOME, FABLE_TASTE_FILE)');
      plan.notes.push('After install, run /mcp in Codex to confirm fable-profile is connected.');
    }
  }
  if (R.doSkills) {
    if (R.skillsSelf) {
      plan.notes.push(`Skills source == destination (${R.skillsDst}) — running inside the fablever repo; the .agents/skills/ skills are already discoverable here, nothing to copy.`);
    } else if (R.skillNames.length) {
      for (const nm of R.skillNames) plan.creates.push(`${path.join(R.skillsDst, nm)}/  (Codex skill)`);
      plan.skills = R.skillNames.slice();
      plan.notes.push(`Codex discovers these skills implicitly by their description (no /hooks trust needed). Requires a Codex build with Agent Skills support; confirm in Codex with /skills if available.`);
    }
  }
  return plan;
}

// ---- runtime copy (servers + profiles + orchestration + docs) so hooks/MCP resolve from any cwd ----------
function installRuntime(R, plan) {
  const { P, repo } = R;
  rmrf(P.runtime); mkdirp(P.runtime);
  // 'measurement' is included so the holdout guard (measurement/runtime/holdout.cjs) and the Codex event
  // logger resolve from the installed runtime — the injector hooks require it to honor an off-arm session.
  for (const d of ['mcp', 'fusion', 'profiles', 'orchestration', 'docs', 'measurement']) cpR(path.join(repo, d), path.join(P.runtime, d));
  // Flat profile copies so the zero-dep hooks resolve <profile-home>/{compact,core}.md without env.
  for (const v of ['full', 'compact', 'core']) {
    try { fs.copyFileSync(path.join(repo, 'profiles', `${v}.md`), path.join(P.profileHome, `${v}.md`)); } catch (_) {}
  }
  plan && plan.creates.push(`${P.runtime}/ (runtime)`);
}

function recordVersion(R) {
  const { P, repo } = R;
  const git = a => { try { const r = spawnSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return (r.status === 0 && r.stdout) ? r.stdout.trim() : ''; } catch { return ''; } };
  const normUrl = u => { u = (u || '').trim(); if (u.startsWith('git@github.com:')) u = 'https://github.com/' + u.slice('git@github.com:'.length); return u.replace(/\.git$/, ''); };
  try {
    fs.writeFileSync(P.installedVersion, JSON.stringify({
      host: 'codex', scope: R.scope, sha: git(['rev-parse', 'HEAD']),
      repo_url: normUrl(git(['config', '--get', 'remote.origin.url'])) || 'https://github.com/elon-choo/fablever',
      source_dir: repo,
      // Record exactly which skill dirs we installed (and where) so uninstall removes only those.
      skills: (R.doSkills && !R.skillsSelf) ? R.skillNames.slice() : [],
      skills_dir: (R.doSkills && !R.skillsSelf) ? R.skillsDst : null,
    }, null, 2) + '\n');
  } catch (_) {}
}

// ---- INSTALL --------------------------------------------------------------------------------------------
function executeInstall(R, log) {
  const { P, repo } = R;
  const plan = { creates: [], modifies: [], backups: [], hooks: [], mcp: [], warnings: [], notes: [] };
  mkdirp(P.profileHome);

  // 1) AGENTS.md marker block
  if (R.doAgents) {
    if (R.agentsSkippedByOverride) {
      log(`  agents   -> SKIPPED: ${P.agentsOverride} exists and overrides AGENTS.md. Use --codex-patch-override to patch it, or remove the override.`);
    } else {
      const block = readFile(path.join(repo, 'codex', 'AGENTS.fable.md'));
      backup(R.agentsTarget, plan);
      const merged = upsertBlock(readFile(R.agentsTarget), AGENTS_START, AGENTS_END, block);
      const existed = writeFileLogged(R.agentsTarget, merged, plan, 'agents');
      log(`  agents   -> ${existed ? 'patched' : 'created'} ${R.agentsTarget} (fablever marker block)`);
    }
  }

  // 2) MCP runtime + registration (do this before hooks so the runtime exists for hook resolution)
  if (R.doMcp) {
    installRuntime(R, plan);
    recordVersion(R);
    log(`  runtime  -> ${P.runtime} (mcp + profiles + orchestration + docs)`);
    if (R.tomlConflict) {
      log(`  mcp      -> SKIPPED: ${P.configToml} already has an [mcp_servers.fable-profile] table outside the fablever marker. Re-run with --force-codex-mcp to overwrite.`);
      plan.warnings.push('mcp conflict: foreign [mcp_servers.fable-profile] table');
    } else {
      backup(P.configToml, plan);
      let cur = readFile(P.configToml);
      // --force-codex-mcp: clear any pre-existing fable-profile registration (our old marker block AND a
      // foreign [mcp_servers.fable-profile] table) before inserting a fresh marker block, so the result
      // never has two same-named TOML tables.
      if (R.opts.forceMcp) { cur = removeBlock(cur, TOML_START, TOML_END); cur = stripTomlTable(cur, 'mcp_servers.fable-profile'); }
      const merged = upsertBlock(cur, TOML_START, TOML_END, tomlBlock(P));
      const existed = writeFileLogged(P.configToml, merged, plan, 'config.toml');
      plan.mcp.push('fable-profile');
      log(`  mcp      -> ${existed ? 'patched' : 'created'} ${P.configToml} (fable-profile; env: FABLE_HOST=codex). Run /mcp in Codex to confirm.`);
    }
  } else if (R.doHooks) {
    // hooks need the flat profile files even without MCP — stage just those.
    mkdirp(P.profileHome);
    for (const v of ['full', 'compact', 'core']) { try { fs.copyFileSync(path.join(repo, 'profiles', `${v}.md`), path.join(P.profileHome, `${v}.md`)); } catch (_) {} }
    recordVersion(R);
  }

  // 3) hooks
  if (R.doHooks) {
    mkdirp(P.hooksDir);
    const copyHook = (name, dst) => { try { fs.copyFileSync(path.join(repo, 'codex', 'hooks', name), dst); chmodx(dst); plan.creates.push(dst); } catch (_) {} };
    copyHook('fable-session.js', R.hookFiles.session);
    copyHook('fable-subagent.js', R.hookFiles.subagent);
    if (R.doReinject) copyHook('fable-reinject.js', R.hookFiles.reinject);

    backup(P.hooksJson, plan);
    let hooksObj; try { hooksObj = JSON.parse(readFile(P.hooksJson) || '{}'); } catch { hooksObj = {}; }
    if (!hooksObj || typeof hooksObj !== 'object') hooksObj = {};
    addHookEntry(hooksObj, 'SessionStart', hookEntry('SessionStart', R.hookFiles.session, 'startup|clear', `${HOOK_STATUS_PREFIX} loading session profile`));
    addHookEntry(hooksObj, 'SubagentStart', hookEntry('SubagentStart', R.hookFiles.subagent, '*', `${HOOK_STATUS_PREFIX} loading subagent profile`));
    if (R.doReinject) addHookEntry(hooksObj, 'UserPromptSubmit', hookEntry('UserPromptSubmit', R.hookFiles.reinject, null, `${HOOK_STATUS_PREFIX} per-turn reminder`));
    writeFileLogged(P.hooksJson, JSON.stringify(hooksObj, null, 2) + '\n', plan, 'hooks.json');
    plan.hooks.push('SessionStart', 'SubagentStart');
    log(`  hooks    -> registered SessionStart + SubagentStart${R.doReinject ? ' + UserPromptSubmit' : ''} in ${P.hooksJson}`);
    log('  hooks    -> ACTION NEEDED: open Codex and run /hooks to review and TRUST these hooks (untrusted command hooks do not run).');
  }

  // 4) Codex Agent Skills — copy each fable-* skill dir into the discovery dir (.agents/skills).
  if (R.doSkills) {
    if (R.skillsSelf) {
      log(`  skills   -> source == destination (${R.skillsDst}); running inside the fablever repo, skills already discoverable — nothing to copy`);
    } else if (R.skillNames.length) {
      mkdirp(R.skillsDst);
      for (const nm of R.skillNames) {
        const dst = path.join(R.skillsDst, nm);
        rmrf(dst); cpR(path.join(R.skillsSrc, nm), dst); plan.creates.push(dst);
      }
      // skills-only install (no MCP, no hooks) still needs a version record so uninstall can find them.
      if (!R.doMcp && !R.doHooks) recordVersion(R);
      log(`  skills   -> installed ${R.skillNames.length} skill(s) into ${R.skillsDst} (${R.skillNames.join(', ')}). Codex matches them by description; no /hooks trust needed.`);
    } else {
      log(`  skills   -> none found in ${R.skillsSrc} (skipped)`);
    }
  }

  return plan;
}

// ---- UNINSTALL (marker-based; removes ONLY fablever's blocks/entries) ------------------------------------
function executeUninstall(R, log) {
  const { P } = R;
  // 1) AGENTS marker block — try both the plain file and the override.
  for (const f of [P.agents, P.agentsOverride]) {
    if (!exists(f)) continue;
    const before = readFile(f);
    if (!hasBlock(before, AGENTS_START, AGENTS_END)) continue;
    backup(f);
    const after = removeBlock(before, AGENTS_START, AGENTS_END);
    if (after.trim() === '') { rmf(f); log(`  agents   -> removed fablever block; ${f} was empty, deleted it`); }
    else { fs.writeFileSync(f, after); log(`  agents   -> removed fablever marker block from ${f}`); }
  }
  // 2) hooks.json entries
  if (exists(P.hooksJson)) {
    let hooksObj; try { hooksObj = JSON.parse(readFile(P.hooksJson)); } catch { hooksObj = null; }
    if (hooksObj) {
      backup(P.hooksJson);
      removeFableEntries(hooksObj, P.hooksDir);
      if (Object.keys(hooksObj).length === 0) { rmf(P.hooksJson); log(`  hooks    -> removed fablever entries; ${P.hooksJson} was empty, deleted it`); }
      else { fs.writeFileSync(P.hooksJson, JSON.stringify(hooksObj, null, 2) + '\n'); log(`  hooks    -> removed fablever entries from ${P.hooksJson}`); }
    }
  }
  for (const f of [R.hookFiles.session, R.hookFiles.subagent, R.hookFiles.reinject]) rmf(f);

  // 3) config.toml MCP marker block. Purely marker-based — we registered via the marker block, NOT
  // `codex mcp add`, so there is nothing for the CLI to remove and we never invoke it here (calling the CLI
  // on uninstall could reformat the user's config.toml AFTER we restore it, breaking byte-for-byte restore).
  if (exists(P.configToml) && hasBlock(readFile(P.configToml), TOML_START, TOML_END)) {
    backup(P.configToml);
    const after = removeBlock(readFile(P.configToml), TOML_START, TOML_END);
    if (after.trim() === '') { rmf(P.configToml); log(`  mcp      -> removed fablever block; ${P.configToml} was empty, deleted it`); }
    else { fs.writeFileSync(P.configToml, after); log(`  mcp      -> removed fablever marker block from ${P.configToml}`); }
  }

  // 3.5) Codex skills — remove ONLY the fable-* skill dirs we installed. Prefer the recorded list from
  // installed-version.json (authoritative); fall back to our shipped source set. Never touch the repo's own
  // .agents/skills when uninstalling project-scope from inside fablever (skillsSrc === skillsDst).
  if (!R.skillsSelf) {
    let recorded = [];
    try { const iv = JSON.parse(readFile(P.installedVersion) || '{}'); if (Array.isArray(iv.skills)) recorded = iv.skills; } catch (_) {}
    const names = recorded.length ? recorded : listSkillNames(R.skillsSrc);
    let removed = 0;
    for (const nm of names) {
      if (!/^fable-/.test(nm)) continue; // defense-in-depth: only ever remove our own fable-* dirs
      const d = path.join(R.skillsDst, nm);
      if (exists(d)) { rmrf(d); removed++; }
    }
    if (removed) {
      // Prune the .agents/skills and .agents dirs only if now empty (they may hold the user's own skills).
      try { fs.rmdirSync(R.skillsDst); } catch (_) {}
      try { fs.rmdirSync(path.dirname(R.skillsDst)); } catch (_) {}
      log(`  skills   -> removed ${removed} fablever skill(s) from ${R.skillsDst}`);
    }
  }

  // 4) runtime + profile home (rmrf the whole profile home so nothing lingers — runtime, version file, AND
  // any campaign measure data under it. Uninstall is an explicit teardown; "removed" should mean removed.)
  rmrf(P.runtime);
  rmf(P.installedVersion);
  rmrf(P.profileHome);
  log('  done     -> Codex fablever install removed (AGENTS/hooks/config/skills + runtime/measure home restored to their pre-fablever content).');
}

// ---- STATUS ---------------------------------------------------------------------------------------------
function statusCodex(R) {
  const { P } = R;
  const agentsActive = exists(P.agents) && hasBlock(readFile(P.agents), AGENTS_START, AGENTS_END);
  const overrideActive = exists(P.agentsOverride) && hasBlock(readFile(P.agentsOverride), AGENTS_START, AGENTS_END);
  const overrideExists = exists(P.agentsOverride);
  let hooksRegistered = [];
  try { const h = JSON.parse(readFile(P.hooksJson) || '{}'); for (const ev of Object.keys(h.hooks || {})) if ((h.hooks[ev] || []).some(e => (e.hooks || []).some(x => (x.statusMessage || '').startsWith(HOOK_STATUS_PREFIX) || (x.command || '').includes(P.hooksDir)))) hooksRegistered.push(ev); } catch (_) {}
  const mcpPresent = exists(P.configToml) && hasBlock(readFile(P.configToml), TOML_START, TOML_END);
  // Skills present = fable-* skill dirs in the discovery dir that match what this repo ships.
  const ours = new Set(listSkillNames(R.skillsSrc));
  const skillsInstalled = R.skillsSelf ? [] : listSkillNames(R.skillsDst).filter(n => ours.has(n));
  const bin = codexBin();
  return {
    host: 'codex', scope: R.scope, codex_home: P.CODEX_HOME,
    agents_guidance_active: agentsActive || overrideActive,
    agents_file: overrideActive ? P.agentsOverride : (agentsActive ? P.agents : null),
    agents_override_exists: overrideExists,
    agents_override_warning: overrideExists && !overrideActive ? 'AGENTS.override.md exists and overrides AGENTS.md at global scope; fablever guidance in AGENTS.md may be shadowed. Use --codex-patch-override.' : null,
    hooks_registered: hooksRegistered,
    hooks_need_trust: hooksRegistered.length ? 'cannot verify trust from outside — run /hooks in Codex to confirm these are trusted' : null,
    mcp_config_present: mcpPresent,
    mcp_confirm: mcpPresent ? 'run /mcp in Codex to confirm fable-profile is connected' : null,
    skills_dir: R.skillsDst,
    skills_installed: skillsInstalled,
    skills_note: R.skillsSelf ? 'running inside the fablever repo — .agents/skills are the source, discoverable in-place' : (skillsInstalled.length ? 'Codex matches these by description; confirm with /skills if your Codex build supports Agent Skills' : null),
    codex_binary: bin || 'not found on PATH',
    codex_mcp_help: bin ? codexMcpHelp() : false,
    auth_status: 'not checked — fablever does not inspect Codex tokens. If a model call says you are signed out, run `codex` or `codex login`.',
    external_verification: 'off (Codex-native install does not enable cross-model xverify)',
    profile_home: P.profileHome, taste_file: P.tasteFile,
    uninstall: `node install.mjs --uninstall --codex${R.scope === 'project' ? ' --codex-scope=project' : ''}`,
    dry_run: 'preview any change first with: node install.mjs --codex-full --dry-run',
  };
}

// ---- plan renderers -------------------------------------------------------------------------------------
function renderPlanText(plan, log) {
  log(`\n[dry-run] fablever Codex install plan — mode=${plan.mode}, scope=${plan.scope}`);
  const list = (label, arr) => { if (arr && arr.length) { log(`\n${label}:`); for (const x of arr) log(`  • ${x}`); } };
  list('Create', plan.creates);
  list('Modify', plan.modifies);
  list('Back up first', plan.backups);
  list('Hook registration', plan.hooks);
  list('MCP registration', plan.mcp);
  log(`\nNetwork behavior:        ${plan.network}`);
  log(`Credential behavior:     ${plan.credential}`);
  log(`Update check:            ${plan.update_check}`);
  log(`External verification:   ${plan.external_verification}`);
  log(`Install risk level:      ${plan.risk}`);
  log(`Uninstall:               ${plan.uninstall}`);
  list('Notes', plan.notes);
  list('WARNINGS', plan.warnings);
  log('\n[dry-run] No files were written.');
}

// ---- public entry ---------------------------------------------------------------------------------------
export async function runCodex(opts) {
  const log = opts.log || (m => process.stdout.write(m + '\n'));
  const R = resolve(opts);

  if (opts.action === 'status') {
    const s = statusCodex(R);
    if (opts.json) { log(JSON.stringify(s, null, 2)); return 0; }
    log(`fablever — Codex status (scope: ${s.scope})`);
    log(`  CODEX_HOME:            ${s.codex_home}`);
    log(`  AGENTS guidance:       ${s.agents_guidance_active ? 'ACTIVE (' + s.agents_file + ')' : 'not installed'}`);
    if (s.agents_override_warning) log(`  ⚠ override:            ${s.agents_override_warning}`);
    log(`  Hooks registered:      ${s.hooks_registered.length ? s.hooks_registered.join(', ') : 'none'}`);
    if (s.hooks_need_trust) log(`  Hooks trust:           ${s.hooks_need_trust}`);
    log(`  MCP config present:    ${s.mcp_config_present ? 'yes' : 'no'}${s.mcp_confirm ? '  (' + s.mcp_confirm + ')' : ''}`);
    log(`  Skills installed:      ${s.skills_installed.length ? s.skills_installed.join(', ') : 'none'}${s.skills_note ? '  (' + s.skills_note + ')' : ''}`);
    log(`  codex binary:          ${s.codex_binary}`);
    log(`  Auth:                  ${s.auth_status}`);
    log(`  External verification: ${s.external_verification}`);
    log(`  Uninstall:             ${s.uninstall}`);
    log(`  Preview changes:       ${s.dry_run}`);
    return 0;
  }

  if (opts.dry) {
    const plan = computePlan(R);
    if (opts.json) { log(JSON.stringify(plan, null, 2)); return 0; }
    renderPlanText(plan, log);
    return 0;
  }

  if (opts.action === 'uninstall') {
    log(`Uninstalling fablever Codex support (scope: ${R.scope}) ...`);
    executeUninstall(R, log);
    return 0;
  }

  // install
  log(`Installing fablever for Codex CLI (mode: ${R.styleOnly ? 'style-only' : 'full'}, scope: ${R.scope})`);
  if (!R.styleOnly) {
    const bin = codexBin();
    if (!bin) log('  note     -> `codex` CLI not found on PATH. Install it from https://github.com/openai/codex (e.g. `npm install -g @openai/codex`). fablever does NOT install it for you.');
    else log(`  note     -> codex detected (${bin}). fablever never reads or stores your Codex/ChatGPT auth.`);
  }
  executeInstall(R, log);
  log('\nDone. fablever never reads/stores/prints Codex tokens — ChatGPT/OAuth login is managed by Codex.');
  if (!R.styleOnly) {
    const skillsHint = (R.doSkills && !R.skillsSelf && R.skillNames.length) ? '   ·   /skills  (if supported — the fable-* skills load on demand)' : '';
    log(`Next in Codex:  /hooks  (trust the fablever hooks)   ·   /mcp  (confirm fable-profile)${skillsHint}`);
    log('If a model call reports you are signed out, run `codex` or `codex login` (headless: `codex login --device-auth`). fablever does not run login for you.');
  }
  log(`Preview/verify later:  node install.mjs --codex-status${R.scope === 'project' ? ' --codex-scope=project' : ''}`);
  return 0;
}

export default { runCodex };
