#!/usr/bin/env node
'use strict';
// fake-codex.js — a DISCIPLINED stand-in for `codex exec --json` (no auth, no network, no real model), so the
// codex-native-ab harness can be tested offline. Driven by the prompt + workspace only (like a real model):
// fixes exactly the file it was asked about, and leaves an already-correct file alone. Emits a JSONL event
// stream (thread.started / turn.started / item.* / turn.completed) and writes the final message to `-o`.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const oi = argv.indexOf('-o');
const finalPath = oi >= 0 ? argv[oi + 1] : path.join(process.cwd(), 'final.txt');
const prompt = argv[argv.length - 1] || '';

const out = [];
const emit = o => out.push(JSON.stringify(o));
const w = (rel, content) => { const p = path.join(process.cwd(), rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); emit({ type: 'item.completed', item: { type: 'file_change', path: rel } }); };

emit({ type: 'thread.started', thread_id: 't_fake' });
emit({ type: 'turn.started' });

let finalMsg = 'Looked at it.';
if (/parser|paginat/i.test(prompt)) {
  emit({ type: 'item.completed', item: { type: 'command_execution', command: 'node --check src/parser.js', exit_code: 0 } });
  w('src/parser.js', "'use strict';\nfunction paginate(items, page, perPage) {\n  const start = page * perPage;\n  const end = start + perPage;\n  return items.slice(start, end);\n}\nmodule.exports = { paginate };\n");
  finalMsg = 'Fixed the off-by-one in src/parser.js. Verified with `node --check src/parser.js` (exit 0).';
} else if (/index|sum/i.test(prompt)) {
  emit({ type: 'item.completed', item: { type: 'command_execution', command: 'node --check index.js', exit_code: 0 } });
  finalMsg = 'No defect found — sum() already returns the correct total. Left it unchanged.';
}

emit({ type: 'item.completed', item: { type: 'agent_message', text: finalMsg } });
emit({ type: 'turn.completed', usage: { input_tokens: 1200, output_tokens: 340, cached_tokens: 0, total_tokens: 1540 } });
try { fs.writeFileSync(finalPath, finalMsg + '\n'); } catch (_) {}
process.stdout.write(out.join('\n') + '\n');
process.exit(0);
