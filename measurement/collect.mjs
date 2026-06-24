#!/usr/bin/env node
// fablever measurement — post-hoc outcome collector (OUT-OF-BAND).
//
// Reads the holdout ledger (which session got arm on/off) and, for each session, harvests OUTCOME SIGNALS
// from the committed transcript AFTER the session ended — the model never sees this. These are heuristic
// proxies for "did the session go well", deliberately multiple (no single-metric conclusions): a worse
// always-on arm should show MORE re-instruction / rework / failed verifications, not fewer.
//
// Usage: node measurement/collect.mjs            # writes measure-outcomes.jsonl next to the ledger
//        node measurement/collect.mjs --json     # also prints the joined rows
// No keys, no network. Reads only ~/.claude/fable-profile/measure-ledger.jsonl and ~/.claude/projects/**.
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseDir = path.join(os.homedir(), '.claude', 'fable-profile');
const ledgerPath = path.join(baseDir, 'measure-ledger.jsonl');
const projectsDir = path.join(os.homedir(), '.claude', 'projects');
const outPath = path.join(baseDir, 'measure-outcomes.jsonl');

// heuristic correction/redirect markers (EN + KO) — a proxy for "the user had to steer me back".
const REINSTRUCT = /\b(no,|nope|actually|that's wrong|that is wrong|not what i|undo|revert|stop,|wrong|instead|don'?t do)\b|아니|다시|틀렸|되돌|그게 아니|하지\s*마|왜\s*안/i;

function readLedger() {
  const byId = new Map();
  let raw = '';
  try { raw = fs.readFileSync(ledgerPath, 'utf8'); } catch { return byId; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.session_id) byId.set(o.session_id, o.arm); } catch { /* skip */ }
  }
  return byId;
}

function findTranscript(sid) {
  // ~/.claude/projects/<sanitized-cwd>/<session_id>.jsonl
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir); } catch { return null; }
  for (const d of dirs) {
    const p = path.join(projectsDir, d, sid + '.jsonl');
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

function harvest(tpath) {
  const s = { tool_calls: 0, assistant_turns: 0, user_msgs: 0, reinstructions: 0, edits: 0, edits_by_file: {}, rework_edits: 0, failed_tool_results: 0, first_ts: null, last_ts: null };
  let raw = '';
  try { raw = fs.readFileSync(tpath, 'utf8'); } catch { return s; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp || o.ts || (o.message && o.message.timestamp);
    if (ts) { if (!s.first_ts) s.first_ts = ts; s.last_ts = ts; }
    const msg = o.message || o;
    const role = (o.type === 'assistant' || msg.role === 'assistant') ? 'assistant'
      : (o.type === 'user' || msg.role === 'user') ? 'user' : null;
    const content = msg.content;
    if (role === 'assistant') {
      s.assistant_turns++;
      if (Array.isArray(content)) for (const b of content) {
        if (b && b.type === 'tool_use') {
          s.tool_calls++;
          const nm = String(b.name || '');
          if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(nm)) {
            s.edits++;
            const f = b.input && (b.input.file_path || b.input.notebook_path);
            if (f) { s.edits_by_file[f] = (s.edits_by_file[f] || 0) + 1; }
          }
        }
      }
    } else if (role === 'user') {
      // user text blocks (skip tool_result-only user turns)
      let text = '';
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        for (const b of content) {
          if (b && b.type === 'text') text += ' ' + (b.text || '');
          if (b && b.type === 'tool_result') {
            const tc = b.content;
            const blob = typeof tc === 'string' ? tc : JSON.stringify(tc || '');
            if (b.is_error || /\b(error|exit code [1-9]|failed|exception|traceback)\b/i.test(blob)) s.failed_tool_results++;
          }
        }
      }
      if (text.trim()) { s.user_msgs++; if (REINSTRUCT.test(text)) s.reinstructions++; }
    }
  }
  s.rework_edits = Object.values(s.edits_by_file).reduce((a, n) => a + Math.max(0, n - 1), 0);
  s.wall_min = (s.first_ts && s.last_ts) ? Math.round((Date.parse(s.last_ts) - Date.parse(s.first_ts)) / 60000) : null;
  return s;
}

function main() {
  const ledger = readLedger();
  if (!ledger.size) { console.log('No ledger yet at', ledgerPath, '— run sessions with FABLE_MEASURE=on first.'); return; }
  const rows = [];
  for (const [sid, arm] of ledger) {
    const tpath = findTranscript(sid);
    if (!tpath) { rows.push({ session_id: sid, arm, transcript: false }); continue; }
    const h = harvest(tpath);
    rows.push({ session_id: sid, arm, transcript: true, ...h, edits_by_file: undefined });
  }
  fs.writeFileSync(outPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const withT = rows.filter(r => r.transcript);
  console.log(`Collected ${rows.length} sessions (${withT.length} with transcripts). Wrote ${outPath}`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
}
main();
