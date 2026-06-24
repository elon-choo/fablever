#!/usr/bin/env node
// fablever measurement — analyze the holdout (ON vs OFF) outcome signals.
//
// Reads measure-outcomes.jsonl and compares the always-on arm against the untreated holdout on the harvested
// signals. The framing is the "harness paradox": the always-on hook/gate layer is supposed to REDUCE
// re-instruction / rework / failed verifications. If the `on` arm is WORSE or EQUAL on those, the layer is
// not paying for the context it costs — and lift≈0 is a break-even warning, not a pass. Lower is better for
// reinstructions / rework / failed_tool_results; the others are descriptive.
//
// Usage: node measurement/analyze.mjs
// park-until-proven: with too few sessions per arm, it reports "underpowered" and refuses a verdict.
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const outPath = path.join(os.homedir(), '.claude', 'fable-profile', 'measure-outcomes.jsonl');
const MIN_PER_ARM = 15; // park-until-proven floor; below this we do not conclude

const LOWER_BETTER = ['reinstructions', 'rework_edits', 'failed_tool_results'];
const DESCRIPTIVE = ['tool_calls', 'assistant_turns', 'wall_min', 'user_msgs'];

function load() {
  let raw = '';
  try { raw = fs.readFileSync(outPath, 'utf8'); } catch { return []; }
  return raw.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter(r => r.transcript);
}
const mean = (xs) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null;
const rate = (rows, k) => mean(rows.map(r => Number(r[k] || 0)));

function main() {
  const rows = load();
  const on = rows.filter(r => r.arm === 'on');
  const off = rows.filter(r => r.arm === 'off');
  console.log(`# fablever holdout analysis\n`);
  console.log(`sessions with transcripts: on=${on.length}, off=${off.length} (ledger floor per arm = ${MIN_PER_ARM})\n`);

  const fmt = (k) => `${k.padEnd(20)} on=${String(rate(on, k)).padStart(7)}  off=${String(rate(off, k)).padStart(7)}`;
  console.log('## lower-is-better (the layer should reduce these)');
  for (const k of LOWER_BETTER) console.log('  ' + fmt(k));
  console.log('\n## descriptive');
  for (const k of DESCRIPTIVE) console.log('  ' + fmt(k));

  console.log('');
  if (on.length < MIN_PER_ARM || off.length < MIN_PER_ARM) {
    console.log(`## verdict — UNDERPOWERED (park-until-proven): need ≥${MIN_PER_ARM} sessions per arm before concluding.`);
    console.log(`Keep FABLE_MEASURE=on across more sessions, re-run collect.mjs, then this. No conclusion drawn from a thin sample.`);
    return;
  }
  // simple directional read on the load-bearing signals
  let worseOn = 0, betterOn = 0;
  for (const k of LOWER_BETTER) {
    const o = rate(on, k), f = rate(off, k);
    if (o == null || f == null) continue;
    if (o > f * 1.05) worseOn++; else if (o < f * 0.95) betterOn++;
  }
  let verdict;
  if (worseOn > betterOn) verdict = 'HARNESS PARADOX SIGNAL — the always-on layer trends WORSE than the untreated holdout on the load-bearing signals. Reduce the gate to deep-only or redesign; an always-on layer that costs context without improving outcomes is a net loss.';
  else if (betterOn > worseOn) verdict = 'the always-on layer trends BETTER (fewer re-instructions/rework/failures) than the untreated holdout — the layer is paying for its context.';
  else verdict = 'BREAK-EVEN — no clear difference. lift≈0 is a warning, not a pass: the layer costs context it is not visibly repaying. Treat as "do not keep always-on without a positive signal."';
  console.log('## verdict (directional, heuristic signals — not a significance test)');
  console.log('  ' + verdict);
}
main();
