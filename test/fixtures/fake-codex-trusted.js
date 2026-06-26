#!/usr/bin/env node
'use strict';
// fake-codex-trusted.js — like the disciplined fake, but it ALSO writes a line to FABLE_HOOK_TRACE_FILE,
// simulating a Codex whose command hooks are TRUSTED and actually ran (real Codex's hooks write that trace).
// Used to prove run.mjs's hook-trust check sees fired hooks; the plain fake (no trace) simulates untrusted.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const oi = argv.indexOf('-o');
const finalPath = oi >= 0 ? argv[oi + 1] : path.join(process.cwd(), 'final.txt');
const prompt = argv[argv.length - 1] || '';

// simulate the SessionStart hook firing (zero content — just like the real hook)
const tf = process.env.FABLE_HOOK_TRACE_FILE;
if (tf) { try { fs.appendFileSync(tf, JSON.stringify({ hook: 'fable-session', ts: 1 }) + '\n'); } catch (_) {} }

const out = [];
out.push(JSON.stringify({ type: 'thread.started' }));
let finalMsg = 'Looked at it.';
if (/parser|paginat/i.test(prompt)) {
  fs.writeFileSync(path.join(process.cwd(), 'src', 'parser.js'), "'use strict';\nfunction paginate(items, page, perPage) {\n  const start = page * perPage;\n  const end = start + perPage;\n  return items.slice(start, end);\n}\nmodule.exports = { paginate };\n");
  out.push(JSON.stringify({ type: 'item.completed', item: { type: 'file_change', path: 'src/parser.js' } }));
  finalMsg = 'Fixed the off-by-one in src/parser.js. Verified with `node --check src/parser.js`.';
}
out.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: finalMsg } }));
out.push(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 50 } }));
try { fs.writeFileSync(finalPath, finalMsg + '\n'); } catch (_) {}
process.stdout.write(out.join('\n') + '\n');
process.exit(0);
