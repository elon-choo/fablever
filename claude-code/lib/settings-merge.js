#!/usr/bin/env node
'use strict';
/*
 * settings-merge.js — idempotently apply/remove Fable-profile changes in a Claude Code settings.json,
 * with a timestamped backup. Zero dependencies. Node only (already required for the MCP).
 *
 * Subcommands (each idempotent, each backs up before writing):
 *   style-on  <settings.json> <styleName>     set "outputStyle": "<styleName>"  (PRIMARY always-on lever)
 *   style-off <settings.json> [styleName]     remove outputStyle (only if it equals styleName, default "Fable")
 *   hook-on   <settings.json> <hook-command>  add a UserPromptSubmit command hook (opt-in anti-decay booster)
 *   hook-off  <settings.json> <hook-command>  remove that UserPromptSubmit hook
 *   subhook-on  <settings.json> <hook-command>  add a SubagentStart command hook (inject style into every subagent)
 *   subhook-off <settings.json> <hook-command>  remove that SubagentStart hook
 *
 * Safety: only touches outputStyle and the single UserPromptSubmit entry matching the hook command.
 * Never modifies any other hook, permission, or field. Re-running is a no-op.
 */
const fs = require('fs');

const [, , mode, settingsPath, arg] = process.argv;
if (!mode || !settingsPath) {
  console.error('usage: settings-merge.js style-on|style-off|hook-on|hook-off <settings.json> <arg>');
  process.exit(2);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`Cannot parse ${p}: ${e.message}. Refusing to touch it.`);
  }
}

const s = readJson(settingsPath);
const before = JSON.stringify(s);

function entryHasHook(entry, cmd) {
  return entry && Array.isArray(entry.hooks) && entry.hooks.some(h => typeof h.command === 'string' && h.command === cmd);
}

switch (mode) {
  case 'style-on': {
    if (!arg) { console.error('style-on requires a style name'); process.exit(2); }
    // Remember the user's prior output style so style-off can RESTORE it (not just delete ours).
    // Don't overwrite an existing memo (idempotent re-install) and don't memo our own style.
    if (s.outputStyle !== undefined && s.outputStyle !== arg && s._fableProfilePrevOutputStyle === undefined) {
      s._fableProfilePrevOutputStyle = s.outputStyle;
    }
    s.outputStyle = arg;
    break;
  }
  case 'style-off': {
    const name = arg || 'Fable';
    // Only act if our style is still the active one (respect a manual change the user made later).
    if (s.outputStyle === name) {
      if (s._fableProfilePrevOutputStyle !== undefined) s.outputStyle = s._fableProfilePrevOutputStyle; // restore prior
      else delete s.outputStyle;                                                                        // had none -> remove
    }
    delete s._fableProfilePrevOutputStyle; // always clean up the memo
    break;
  }
  // hook-on/off  -> UserPromptSubmit (main-session per-turn reminder)
  // subhook-on/off -> SubagentStart  (one-time injection into every spawned subagent, incl. background)
  case 'hook-on':
  case 'subhook-on':
  case 'sesshook-on': {
    if (!arg) { console.error(`${mode} requires a hook command`); process.exit(2); }
    const event = mode === 'subhook-on' ? 'SubagentStart' : mode === 'sesshook-on' ? 'SessionStart' : 'UserPromptSubmit';
    s.hooks = s.hooks || {};
    const arr = Array.isArray(s.hooks[event]) ? s.hooks[event] : [];
    if (!arr.some(e => entryHasHook(e, arg))) {
      const entry = { hooks: [{ type: 'command', command: arg, timeout: 10 }] };
      if (event === 'SubagentStart') entry.matcher = '*'; // fire for every subagent type
      arr.push(entry);
    }
    s.hooks[event] = arr;
    break;
  }
  case 'hook-off':
  case 'subhook-off':
  case 'sesshook-off': {
    if (!arg) { console.error(`${mode} requires a hook command`); process.exit(2); }
    const event = mode === 'subhook-off' ? 'SubagentStart' : mode === 'sesshook-off' ? 'SessionStart' : 'UserPromptSubmit';
    if (s.hooks && Array.isArray(s.hooks[event])) {
      s.hooks[event] = s.hooks[event].filter(e => !entryHasHook(e, arg));
      if (s.hooks[event].length === 0) delete s.hooks[event];
      if (Object.keys(s.hooks).length === 0) delete s.hooks;
    }
    break;
  }
  default:
    console.error(`unknown mode: ${mode}`);
    process.exit(2);
}

const after = JSON.stringify(s);
if (after === before) {
  console.log(`no change needed (${mode} already applied)`);
  process.exit(0);
}

if (fs.existsSync(settingsPath)) {
  const ts = process.env.FABLE_TS || String(process.hrtime.bigint());
  const bak = `${settingsPath}.fable-bak-${ts}`;
  fs.copyFileSync(settingsPath, bak);
  console.log(`backup: ${bak}`);
}
fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
console.log(`${mode}: wrote ${settingsPath}`);
