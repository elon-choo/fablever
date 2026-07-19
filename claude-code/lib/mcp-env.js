#!/usr/bin/env node
'use strict';

// Reconcile one environment key on an existing Claude Code user-scope MCP entry.
// This preserves every unrelated config byte-value and is used only after `claude mcp list`
// confirms the named server exists. Zero dependencies; stdout is `changed` or `unchanged`.
// Exit 3 means the config/entry could not be found or parsed, so the caller may fall back
// to `claude mcp remove` + `claude mcp add`.

const fs = require('node:fs');

const [, , mode, file, serverName, key, desired] = process.argv;
if (mode !== 'sync' || !file || !serverName || !key || desired === undefined) {
  process.stderr.write('usage: mcp-env.js sync <config.json> <server> <key> <value|--absent>\n');
  process.exit(2);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (_) {
  process.exit(3);
}

const entry = config?.mcpServers?.[serverName];
if (!entry || typeof entry !== 'object' || Array.isArray(entry)) process.exit(3);

const before = JSON.stringify(config);
if (desired === '--absent') {
  if (entry.env && typeof entry.env === 'object' && !Array.isArray(entry.env)) {
    Reflect.deleteProperty(entry.env, key);
    if (Object.keys(entry.env).length === 0) delete entry.env;
  }
} else {
  if (!entry.env || typeof entry.env !== 'object' || Array.isArray(entry.env)) entry.env = {};
  Reflect.set(entry.env, key, desired);
}

if (JSON.stringify(config) === before) {
  process.stdout.write('unchanged\n');
  process.exit(0);
}

try {
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  process.stdout.write('changed\n');
} catch (_) {
  process.exit(3);
}
