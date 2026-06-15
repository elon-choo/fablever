#!/usr/bin/env node
'use strict';
/*
 * mcp-remove.js — deterministically remove named MCP servers from a Claude config JSON
 * (e.g. ~/.claude.json) WITHOUT needing the `claude` CLI. Used as the uninstall fallback so
 * "uninstall restores prior settings" holds even when `claude` is not on PATH (SEC-2).
 *
 * Safety: backs up before writing; deletes ONLY the named keys under mcpServers; leaves every
 * other server, field, and file untouched; never errors out the uninstall (always exits 0).
 *
 * usage: node mcp-remove.js <config.json> <serverName...>
 */
const fs = require('fs');

const [, , file, ...names] = process.argv;
if (!file || !names.length) { console.error('usage: mcp-remove.js <config.json> <serverName...>'); process.exit(2); }

let cfg;
try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) {
  if (e.code === 'ENOENT') process.exit(0);                 // no config -> nothing to do
  console.error('mcp-remove: cannot parse ' + file + ' (' + e.message + ') — leaving it untouched.');
  process.exit(0);                                          // never break uninstall
}

const before = JSON.stringify(cfg);
if (cfg && cfg.mcpServers && typeof cfg.mcpServers === 'object') {
  for (const n of names) delete cfg.mcpServers[n];
  if (Object.keys(cfg.mcpServers).length === 0) delete cfg.mcpServers;
}
if (JSON.stringify(cfg) === before) { console.log('mcp-remove: nothing to remove from ' + file); process.exit(0); }

try {
  const bak = file + '.fable-bak-' + (process.env.FABLE_TS || String(process.hrtime.bigint()));
  fs.copyFileSync(file, bak);
  console.log('backup: ' + bak);
} catch (_) { /* best-effort backup */ }
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log('mcp-remove: stripped [' + names.join(', ') + '] from ' + file);
