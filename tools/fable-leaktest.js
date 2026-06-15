#!/usr/bin/env node
'use strict';
/*
 * fable-leaktest.js — measure whether your models' behavior actually converges on Fable's signature.
 * READ-ONLY. Zero dependencies. No network. Nothing leaves the machine.
 *
 * It scans your local Claude Code transcripts (~/.claude/projects/ ** /*.jsonl), buckets assistant
 * messages by model, and reports four behavioral metrics that distinguish Fable's working style from
 * a verbose/over-eager one:
 *    - median words per assistant message   (Fable: terse body; lower is more Fable-like)
 *    - tool:text block ratio                  (Fable acts more than it narrates; higher is more Fable-like)
 *    - unsolicited-caveat rate                (hedging/filler; lower is more Fable-like)
 *    - self-narration opener rate             ("I'll…/Let me…" openers; lower is more Fable-like)
 *
 * Usage:
 *   node fable-leaktest.js                       all transcripts, grouped by model
 *   node fable-leaktest.js --since 2026-06-15    only messages on/after a date (e.g. profile install day)
 *   node fable-leaktest.js --dir <path>          transcript root (default ~/.claude/projects)
 *   node fable-leaktest.js --json                machine-readable output
 *
 * Caveat (honesty): these are SURFACE proxies for "Fable-like", not a measure of judgment or
 * correctness. Use them to detect a style regression or confirm the profile is moving the needle —
 * not to prove the work got better. Your own logs are a convenience sample, not a controlled study.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
function flag(name, def) { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || true) : def; }
const ROOT = flag('--dir', path.join(os.homedir(), '.claude', 'projects'));
const SINCE = flag('--since', null);
const JSON_OUT = args.includes('--json');
const sinceMs = SINCE ? Date.parse(SINCE) : null;

function* walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && p.endsWith('.jsonl')) yield p;
  }
}

const HEDGE = /\b(perhaps|maybe|possibly|i think|it seems|sort of|kind of|i believe|probably|might be|could be|just to be safe|let me know if|if you'?d like|feel free to|i could also)\b/i;
const SELF_OPENER = /^\s*(i'll\b|i will\b|let me\b|i'm going to\b|i am going to\b|now i|first,? i|next,? i|i'm now)/i;

function modelBucket(model) {
  if (!model) return 'unknown';
  const m = String(model).toLowerCase();
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return m;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

const stats = {}; // bucket -> accumulators
function bucket(b) {
  return stats[b] || (stats[b] = { msgs: 0, words: [], toolBlocks: 0, textBlocks: 0, caveats: 0, selfOpeners: 0 });
}

for (const file of walk(ROOT)) {
  let lines;
  try { lines = fs.readFileSync(file, 'utf8').split('\n'); } catch { continue; }
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj.message || obj;
    const role = msg.role || obj.type;
    if (role !== 'assistant') continue;
    if (sinceMs) {
      const ts = Date.parse(obj.timestamp || msg.timestamp || obj.ts || 0);
      if (!Number.isNaN(ts) && ts < sinceMs) continue;
    }
    const b = bucket(modelBucket(msg.model));
    b.msgs++;
    const content = Array.isArray(msg.content) ? msg.content : (typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : []);
    let textParts = [];
    for (const blk of content) {
      if (!blk || typeof blk !== 'object') continue;
      if (blk.type === 'tool_use') b.toolBlocks++;
      else if (blk.type === 'text' && typeof blk.text === 'string') { b.textBlocks++; textParts.push(blk.text); }
    }
    const text = textParts.join('\n').trim();
    if (text) {
      b.words.push((text.match(/\S+/g) || []).length);
      if (HEDGE.test(text)) b.caveats++;
      if (SELF_OPENER.test(text)) b.selfOpeners++;
    }
  }
}

const report = {};
for (const [b, s] of Object.entries(stats)) {
  const textMsgs = s.words.length || 1;
  report[b] = {
    assistant_messages: s.msgs,
    median_words_per_msg: median(s.words),
    tool_to_text_ratio: +(s.toolBlocks / (s.textBlocks || 1)).toFixed(2),
    unsolicited_caveat_pct: +(100 * s.caveats / textMsgs).toFixed(1),
    self_opener_pct: +(100 * s.selfOpeners / textMsgs).toFixed(1),
  };
}

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, since: SINCE || null, buckets: report }, null, 2));
} else {
  console.log(`Fable leak-test  (root: ${ROOT}${SINCE ? `, since ${SINCE}` : ''})`);
  if (!Object.keys(report).length) { console.log('  no assistant messages found.'); process.exit(0); }
  const cols = ['model', 'msgs', 'med.words', 'tool:text', 'caveat%', 'I\'ll/Let-me%'];
  console.log('  ' + cols.map(c => c.padEnd(12)).join(''));
  console.log('  ' + '-'.repeat(72));
  for (const [b, r] of Object.entries(report).sort((a, c) => c[1].assistant_messages - a[1].assistant_messages)) {
    console.log('  ' + [
      b, r.assistant_messages, r.median_words_per_msg, r.tool_to_text_ratio, r.unsolicited_caveat_pct, r.self_opener_pct,
    ].map(x => String(x).padEnd(12)).join(''));
  }
  console.log('\n  More Fable-like = lower med.words, higher tool:text, lower caveat%, lower I\'ll/Let-me%.');
  console.log('  Run with --since <profile-install-date> and compare opus before/after to see if the profile moved the needle.');
  console.log('  (Surface proxies for working style, not a measure of correctness — see file header.)');
}
