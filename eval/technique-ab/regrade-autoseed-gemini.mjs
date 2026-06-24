// regrade-autoseed-gemini.mjs — JUDGE-ROBUSTNESS check on the OTHER shipped artifact: the fable-seed skill.
//
// The auto-seed result (a generator that reads a module's existing code and writes its AGENTS.md preserves
// the convention-adherence lift) is what justifies the shipped `claude-code/skills/fable-seed` skill. Its
// headline — arm D (auto seed) ≈ 88.9% adherence vs B (hand seed) 100% and A (no seed) 33.3% — rests on a
// single GPT-5.5 (codex) oracle. Same hardening we just did for the inline directive: re-grade the SAME 27
// on-disk (convention × arm) outputs with a DIFFERENT lab's model — Gemini 3.1 pro — using the IDENTICAL grade
// instruction. No new generation. If Gemini also puts D well above A and near B, the skill's claim is
// judge-robust, not an artifact of the codex oracle.
//
// Usage: node regrade-autoseed-gemini.mjs [grade|report]   (no arg = grade then report). Needs GEMINI_API_KEY
// + network (sandbox override). Caches grades in as-grade-gm/ so reruns are free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'as-raw'), GRD = path.join(HERE, 'as-grade-gm');
fs.mkdirSync(GRD, { recursive: true });
const KEY = process.env.GEMINI_API_KEY;
const GMODEL = 'gemini-3.1-pro-preview';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent?key=${KEY}`;
const GRADE_CONC = 3, BATCH = 5, GRADE_TIMEOUT_MS = 60000;
const ARMS = [['A', 'A_none'], ['B', 'B_hand_seed'], ['D', 'D_auto_seed']];
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

function loadItems() {
  const out = [];
  for (const f of fs.readdirSync(RAW)) {
    if (!f.endsWith('.json')) continue;
    const r = readJSON(path.join(RAW, f));
    if (!r || !r.conv) continue;
    for (const [arm] of ARMS) if (r[arm]) out.push({ id: r.id, arm, conv: r.conv, text: r[arm] });
  }
  return out;
}

// IDENTICAL grade instruction to run-autoseed.mjs's GPT-5.5 oracle — only the judge model differs.
function gradeBatchPrompt(items) {
  const blocks = items.map((j, i) => `=== ITEM ${i + 1} ===\nCONVENTION: ${j.conv}\nCODE/REPLY:\n${j.text || '(empty)'}`).join('\n\n');
  return `For each item below, decide STRICTLY whether the CODE/REPLY follows the stated CONVENTION. "follows" = true only if it actually obeys the rule (not merely mentions it). ${items.length} items.\n\n${blocks}\n\nOutput ONLY one line of JSON: {"results":[{"n":1,"follows":true|false}, ...]} with one entry per item.`;
}
function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), GRADE_TIMEOUT_MS);
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }), signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
    return extractJSON(txt, x => Array.isArray(x.results));
  } catch { clearTimeout(t); return null; }
}
async function gradeBatch(items) { for (let a = 0; a < 4; a++) { const v = await callGemini(gradeBatchPrompt(items)); if (v && Array.isArray(v.results) && v.results.length >= Math.ceil(items.length / 2)) return v.results; await new Promise(z => setTimeout(z, 2000 * (a + 1))); } return null; }

async function grade() {
  const items = loadItems();
  console.log(`[grade] ${items.length} (convention × arm) items, judge=${GMODEL}`);
  const file = j => path.join(GRD, `${j.id}__${j.arm}.json`);
  const todo = items.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[grade] ${todo.length} to grade in ${batches.length} batches`); let done = 0;
  await pool(batches, GRADE_CONC, async (batch) => {
    const v = await gradeBatch(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, arm: j.arm, follows: !!x.follows }, null, 2)); }
    done += batch.length; console.log(`[grade] ~${done}/${todo.length}`);
  });
}

function report() {
  const items = loadItems();
  const G = {}; for (const f of fs.readdirSync(GRD)) { const g = readJSON(path.join(GRD, f)); if (g) G[`${g.id}__${g.arm}`] = g.follows; }
  const ids = [...new Set(items.map(i => i.id))];
  const rate = arm => { const vals = ids.map(id => G[`${id}__${arm}`]).filter(v => v !== undefined); return { pct: vals.length ? +(100 * vals.filter(Boolean).length / vals.length).toFixed(1) : null, n: vals.length }; };
  const A = rate('A'), B = rate('B'), D = rate('D');
  const gpt = { A: 33.3, B: 100, D: 88.9 }; // the shipped GPT-5.5 oracle numbers
  const out = { judge: GMODEL, n: ids.length, gemini: { A_none: A.pct, B_hand_seed: B.pct, D_auto_seed: D.pct }, gpt5_5: gpt };
  fs.writeFileSync(path.join(HERE, 'results-regrade-autoseed-gemini.json'), JSON.stringify(out, null, 2));
  const preserved = (B.pct && D.pct !== null) ? +(100 * D.pct / B.pct).toFixed(0) : null;
  const robust = D.pct !== null && D.pct > A.pct && B.pct !== null && D.pct >= 0.8 * B.pct;
  let verdict, body;
  if (robust) {
    verdict = 'JUDGE-ROBUST — the fable-seed adherence lift holds under a second lab';
    body = `Gemini 3.1 pro, grading the SAME 9 outputs per arm with the identical instruction, reproduces the auto-seed pattern: no-seed **${A.pct}%** → auto-seed **${D.pct}%** → hand-seed **${B.pct}%** (auto preserves **${preserved}%** of hand). GPT-5.5 had ${gpt.A}/${gpt.D}/${gpt.B}%. Both labs agree a generator that reads existing code carries the convention nearly as well as a hand-written file — so the shipped \`fable-seed\` skill's claim is **not a single-oracle artifact.**`;
  } else if (D.pct !== null && D.pct > A.pct) {
    verdict = 'DIRECTIONALLY ROBUST — auto still beats no-seed, but lower under Gemini';
    body = `Gemini puts auto-seed (D ${D.pct}%) above no-seed (A ${A.pct}%) — same direction as GPT-5.5's ${gpt.D} vs ${gpt.A} — but below 80% of the hand-seed ceiling (B ${B.pct}%), so it reads the auto file as carrying *less* of the convention than the codex oracle did. The lift is confirmed in sign, weaker in magnitude under a second judge. Honest: auto-seed helps under both labs; the "nearly as good as hand-written" strength is GPT-5.5-leaning.`;
  } else {
    verdict = 'JUDGE-DEPENDENT — Gemini does NOT confirm the auto-seed lift';
    body = `Gemini does not reproduce the lift (A ${A.pct}%, D ${D.pct}%, B ${B.pct}%). The auto-seed headline is judge-dependent; the \`fable-seed\` skill's adherence number should be downgraded to GPT-5.5-specific until reconciled. Worth surfacing to the owner.`;
  }
  const L = ['# Judge-robustness — does the SHIPPED fable-seed adherence lift hold under a SECOND judge?\n',
    `The \`fable-seed\` skill is justified by the auto-seed A/B (arm D auto-generates the AGENTS.md by reading existing code). Its headline rests on a GPT-5.5 (codex) oracle. This re-grades the **same ${ids.length} outputs per arm** with **${GMODEL}** (a different lab), identical instruction. No new generation — only the judge changes.\n`,
    '| judge | A: no seed | D: auto seed | B: hand seed | auto preserves |',
    '|---|---|---|---|---|',
    `| GPT-5.5 (shipped on) | ${gpt.A}% | ${gpt.D}% | ${gpt.B}% | ${(100 * gpt.D / gpt.B).toFixed(0)}% |`,
    `| **${GMODEL}** (this check) | ${A.pct}% | ${D.pct}% | ${B.pct}% | ${preserved}% |`,
    '',
    `## Verdict — ${verdict}`,
    body,
    `\nSame outputs, two labs; n=${ids.length} conventions per arm. A judge-robustness check on a shipped skill, not a new claim.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-regrade-autoseed-gemini.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (!KEY) { console.log('GEMINI_API_KEY not set — aborting'); process.exit(0); }
if (m === 'grade') await grade();
else if (m === 'report') report();
else { await grade(); report(); }
