// rejudge-evidence-gemini.mjs — JUDGE-ROBUSTNESS check on the SHIPPED inline evidence-discipline.
//
// The inline evidence directive is the one change actually wired into production (profiles/full.md +
// compact.md). It earned its place on a GPT-5.5 forced-choice (S1-inline beat baseline; pooled 26–6,
// p=0.0005). But this repo's own history shows forced-choice can be JUDGE-DEPENDENT (the real-log replay
// flipped between GPT-5.5 and Gemini). So before trusting a shipped change, re-judge the SAME already-generated
// A vs S1 pairs (16 from se-raw + 18 from r2-raw = 34) with a DIFFERENT lab's model — Gemini 3.1 pro — using
// the IDENTICAL judge instruction. Only the judge model changes. If Gemini also prefers S1, the shipped
// directive is judge-robust, not an artifact of one judge. No new generation: this re-uses on-disk outputs.
//
// Usage: node rejudge-evidence-gemini.mjs [judge|report]   (no arg = judge then report). Needs GEMINI_API_KEY
// and network (run with the sandbox override). Caches verdicts in gm-judge/ so reruns are free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JUD = path.join(HERE, 'gm-judge');
fs.mkdirSync(JUD, { recursive: true });
const KEY = process.env.GEMINI_API_KEY;
const GMODEL = 'gemini-3.1-pro-preview';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent?key=${KEY}`;
const JUDGE_CONC = 3, BATCH = 5, JUDGE_TIMEOUT_MS = 60000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// Load the already-generated A vs S1 pairs from both surgical rounds.
function loadPairs() {
  const out = [];
  for (const [dir, pre] of [['se-raw', 'se'], ['r2-raw', 'r2']]) {
    const d = path.join(HERE, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue;
      const r = readJSON(path.join(d, f));
      if (r && r.A && r.S1) out.push({ id: `${pre}_${r.id}`, req: r.prompt, A: r.A, S1: r.S1 });
    }
  }
  return out;
}

// IDENTICAL judge instruction to the GPT-5.5 surgical runs — only the judge model differs.
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the same coding request — pick the ONE you'd rather receive to ship a correct result with least extra work. Pick A or B for every one (no ties). Reward correctness, a fix that is actually shown to work, decisiveness, scope discipline, tight writing. Penalize unsupported "it works" claims, doing more than asked, padding.\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), JUDGE_TIMEOUT_MS);
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }), signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
    return extractJSON(txt, x => Array.isArray(x.verdicts));
  } catch { clearTimeout(t); return null; }
}
async function batchJudge(items) { for (let a = 0; a < 4; a++) { const v = await callGemini(batchPrompt(items)); if (v && Array.isArray(v.verdicts) && v.verdicts.length >= Math.ceil(items.length / 2)) return v.verdicts; await new Promise(z => setTimeout(z, 2000 * (a + 1))); } return null; }

async function judge() {
  const pairs = loadPairs();
  console.log(`[judge] ${pairs.length} A-vs-S1 pairs (se+r2), judge=${GMODEL}`);
  const jobs = [];
  for (const r of pairs) {
    // both orders; slA/slB carry which arm sat in slot A/B so we can map winner→arm
    jobs.push({ id: r.id, order: 'o1', slA: 'A', slB: 'S1', At: r.A, Bt: r.S1, req: r.req });
    jobs.push({ id: r.id, order: 'o2', slA: 'S1', slB: 'A', At: r.S1, Bt: r.A, req: r.req });
  }
  const file = j => path.join(JUD, `${j.id}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[judge] ${todo.length} judgments in ${batches.length} batches`); let done = 0;
  await pool(batches, JUDGE_CONC, async (batch) => {
    const v = await batchJudge(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; const w = String(x.winner).toUpperCase().includes('B') ? j.slB : j.slA; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, order: j.order, winnerArm: w }, null, 2)); }
    done += batch.length; console.log(`[judge] ~${done}/${todo.length}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function report() {
  const pairs = loadPairs();
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.order}`] = v; }
  let S1 = 0, A = 0, tie = 0, missing = 0;
  for (const r of pairs) {
    const o1 = J[`${r.id}__o1`], o2 = J[`${r.id}__o2`];
    if (!o1 || !o2) { missing++; continue; }
    if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'S1') S1++; else A++; } else tie++;
  }
  const dec = S1 + A, pRaw = dec ? binomTwoSided(S1, dec) : null;
  const p = pRaw === null ? null : +pRaw.toFixed(4);
  const pDisp = pRaw === null ? 'n/a' : (pRaw < 0.0001 ? '<0.0001' : String(+pRaw.toFixed(4)));
  const out = { judge: GMODEL, pairs: pairs.length, S1, A, tie, missing, decided: dec, S1_pct: dec ? +(100 * S1 / dec).toFixed(1) : null, p, p_display: pDisp };
  fs.writeFileSync(path.join(HERE, 'results-rejudge-gemini.json'), JSON.stringify(out, null, 2));
  // The GPT-5.5 pooled result we are checking against:
  const gpt = { S1: 26, A: 6, dec: 32, p: 0.0005 };
  const robust = S1 > A && (p !== null && p < 0.05);
  const sameDirection = S1 > A;
  let verdict, body;
  if (robust) {
    verdict = 'JUDGE-ROBUST — the shipped inline directive holds under a second lab';
    body = `Gemini 3.1 pro, given the IDENTICAL instruction on the SAME 34 generations, also prefers the inline arm **S1 ${S1}–${A}** of ${dec} decided (${out.S1_pct}%, p=${pDisp}). The GPT-5.5 pooled result was S1 26–6 (p=0.0005). Two different labs agree the inline evidence-discipline produces the reply a senior engineer would rather ship — so the production change in profiles/full.md + compact.md is **not a single-judge artifact.**`;
  } else if (sameDirection) {
    verdict = 'DIRECTIONALLY ROBUST — same sign, weaker under Gemini';
    body = `Gemini also leans toward the inline arm (S1 ${S1}–${A}, ${out.S1_pct}%, p=${p}) but not at p<0.05. Same direction as GPT-5.5's S1 26–6, lower magnitude — the directive is not contradicted by a second judge, but Gemini is less decisive. Honest: directionally confirmed, not independently significant at this pooled n.`;
  } else {
    verdict = 'JUDGE-DEPENDENT — Gemini does NOT confirm';
    body = `Gemini split S1 ${S1}–${A} (${out.S1_pct}%, p=${p}) — it does NOT reproduce GPT-5.5's S1 26–6 preference. The shipped directive's win is **judge-dependent**, exactly the failure mode this repo flagged. The directive still cut unsupported claims deterministically, but the "senior engineer prefers it" framing should be downgraded to GPT-5.5-specific until reconciled. Worth surfacing to the owner.`;
  }
  const L = ['# Judge-robustness — does the SHIPPED inline evidence-discipline hold under a SECOND judge?\n',
    `The inline directive is the one change wired into production. It won on GPT-5.5 (pooled S1 vs baseline **26–6, p=0.0005**). This re-judges the **same ${pairs.length} on-disk A-vs-S1 generations** with **${GMODEL}** (a different lab), identical instruction, both orders. No new generation — only the judge model changes.\n`,
    '| judge | S1 (inline) | A (baseline) | decided | S1 % | p |',
    '|---|---|---|---|---|---|',
    `| GPT-5.5 (shipped on) | ${gpt.S1} | ${gpt.A} | ${gpt.dec} | ${(100 * gpt.S1 / gpt.dec).toFixed(1)}% | ${gpt.p} |`,
    `| **${GMODEL}** (this check) | ${S1} | ${A} | ${dec} | ${out.S1_pct}% | ${pDisp} |`,
    '',
    `${tie} position-bias ties; ${missing} pairs unjudged.`,
    '',
    `## Verdict — ${verdict}`,
    body,
    `\nSame generations, two labs; pooled n=${dec} decided. A judge-robustness check on a production change, not a new claim.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-rejudge-gemini.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (!KEY) { console.log('GEMINI_API_KEY not set — aborting'); process.exit(0); }
if (m === 'judge') await judge();
else if (m === 'report') report();
else { await judge(); report(); }
