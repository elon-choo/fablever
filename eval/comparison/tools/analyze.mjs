// analyze.mjs — locked analysis for the fablever preference study. Unit of analysis = QUESTION.
// Reads per-call verdicts from JUDGE_OUT, applies the both-orders consistency gate, reduces to per-question
// scores, runs exact binomial + cluster bootstrap + Wilson + per-category + Cohen's kappa + position/length diagnostics.
import fs from 'node:fs'; import path from 'node:path';

const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const RUNS = (process.env.RUNS || `${BASE}/preference-battery,${BASE}/preference-battery-v2`).split(',');
const JUDGE_OUT = process.env.JUDGE_OUT || (RUNS[0] + '/judgments');
const CAT = id => id.replace(/[0-9].*$/, '').replace(/_.*/, '').toUpperCase(); // ACT_x / ACT2_x -> ACT
const catName = { ACT: 'action/how-to', DEC: 'decision', DBG: 'debug', PLN: 'planning', EXP: 'explanation', REV: 'code-review' };

// ---- load verdicts ----
const files = fs.readdirSync(JUDGE_OUT).filter(f => f.endsWith('.json'));
const recs = files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(JUDGE_OUT, f), 'utf8')); } catch { return null; } }).filter(r => r && r.ok && r.verdict);
console.log(`loaded ${recs.length} ok verdicts (of ${files.length} files)`);

// ---- consistency gate: per (id,k,judge) need order1 & order2 to agree on winner_arm ----
const byPair = {};
for (const r of recs) { const key = `${r.id}__k${r.k}__${r.judge}`; (byPair[key] ||= {})[r.order] = r; }
const gated = []; // {id,k,judge,cat,decisive,winner}
let flips = 0, pairsBoth = 0;
for (const [key, o] of Object.entries(byPair)) {
  if (!o[1] || !o[2]) continue; pairsBoth++;
  const [id, kpart, judge] = key.split('__'); const k = +kpart.slice(1);
  const decisive = o[1].winner_arm === o[2].winner_arm;
  if (!decisive) flips++;
  gated.push({ id, k, judge, cat: CAT(id), decisive, winner: decisive ? o[1].winner_arm : null });
}
console.log(`gated pairs: ${pairsBoth} both-orders present; position-flip (tie) rate: ${(100 * flips / pairsBoth).toFixed(1)}%`);

// ---- per-question y_i: pooled decisive judgments favoring A1 / total decisive ----
const qids = [...new Set(gated.map(g => g.id))];
const perQ = {};
for (const id of qids) {
  const g = gated.filter(x => x.id === id && x.decisive);
  const a1 = g.filter(x => x.winner === 'A1').length, n = g.length;
  perQ[id] = { id, cat: CAT(id), decisive: n, a1, y: n ? a1 / n : null, win: n ? (a1 / n > 0.5 ? 'A1' : (a1 / n < 0.5 ? 'A0' : 'tie')) : 'nodata' };
}

// ---- stats helpers ----
function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
function binomGE(k, n) { let s = 0; for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + n * Math.log(0.5)); return s; } // P(X>=k), p=.5
function binomTwoSided(k, n) { const p = k >= n / 2 ? 2 * binomGE(k, n) : 2 * (1 - binomGE(k + 1, n)); return Math.min(1, p); }
function wilson(k, n, z = 1.96) { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n; const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; }

// deterministic PRNG so bootstrap is reproducible (no Math.random)
let _s = 123456789; const rnd = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) / 4294967296); };
function clusterBootstrap(items, B = 10000) { // items: per-question win indicators (1=A1,0=A0) among decisive
  const n = items.length, means = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += items[(rnd() * n) | 0]; means.push(s / n); }
  means.sort((a, b) => a - b); return [means[(0.025 * B) | 0], means[(0.975 * B) | 0]];
}

// ---- PRIMARY: item-level win-rate over decisive questions ----
const decidedQ = qids.map(id => perQ[id]).filter(q => q.win === 'A1' || q.win === 'A0');
const ties = qids.length - decidedQ.length;
const a1wins = decidedQ.filter(q => q.win === 'A1').length, N = decidedQ.length;
const winInd = decidedQ.map(q => q.win === 'A1' ? 1 : 0);
const p = binomTwoSided(a1wins, N), ci = clusterBootstrap(winInd), wil = wilson(a1wins, N);
console.log(`\n=== PRIMARY (unit=question, n=${qids.length}; decisive=${N}, ties=${ties}) ===`);
console.log(`A1 preferred on ${a1wins}/${N} decisive questions = ${(100 * a1wins / N).toFixed(1)}%`);
console.log(`exact two-sided binomial p = ${p.toFixed(4)}  ${p <= 0.05 ? 'SIGNIFICANT' : 'n.s.'}`);
console.log(`Wilson 95% CI = [${(100 * wil[0]).toFixed(1)}%, ${(100 * wil[1]).toFixed(1)}%]`);
console.log(`cluster-bootstrap 95% CI = [${(100 * ci[0]).toFixed(1)}%, ${(100 * ci[1]).toFixed(1)}%]  (excludes 50%: ${ci[0] > 0.5 || ci[1] < 0.5})`);

// ---- per-judge (direction must hold under EACH) ----
console.log(`\n=== per-judge (direction must hold independently) ===`);
for (const judge of ['gemini', 'gpt']) {
  const gq = {};
  for (const id of qids) { const g = gated.filter(x => x.id === id && x.judge === judge && x.decisive); const a1 = g.filter(x => x.winner === 'A1').length; if (g.length) gq[id] = a1 / g.length > 0.5 ? 1 : (a1 / g.length < 0.5 ? 0 : null); }
  const dec = Object.values(gq).filter(v => v !== null); const a1 = dec.filter(v => v === 1).length;
  if (dec.length) console.log(`  ${judge}: A1 ${a1}/${dec.length} = ${(100 * a1 / dec.length).toFixed(1)}%  (p=${binomTwoSided(a1, dec.length).toFixed(4)})`);
  else console.log(`  ${judge}: no data`);
}

// ---- per-category (DESCRIPTIVE; Wilson CI) ----
console.log(`\n=== per-category (descriptive; pre-registered: ACT/DEC/DBG strong A1, PLN moderate, EXP/REV predicted A1 loss/tie) ===`);
for (const c of ['ACT', 'DEC', 'DBG', 'PLN', 'EXP', 'REV']) {
  const qs = decidedQ.filter(q => q.cat === c); const a1 = qs.filter(q => q.win === 'A1').length, n = qs.length; const w = wilson(a1, n);
  console.log(`  ${c.padEnd(4)} ${(catName[c] || '').padEnd(14)} A1 ${a1}/${n} = ${n ? (100 * a1 / n).toFixed(0) : '-'}%  Wilson[${(100 * w[0]).toFixed(0)},${(100 * w[1]).toFixed(0)}]`);
}

// ---- Cohen's kappa: GPT vs Gemini on shared decisive per-question (k=1) verdicts ----
const pairsK1 = {};
for (const g of gated.filter(x => x.k === 1 && x.decisive)) (pairsK1[g.id] ||= {})[g.judge] = g.winner;
const both = Object.values(pairsK1).filter(o => o.gemini && o.gpt);
if (both.length) {
  const agree = both.filter(o => o.gemini === o.gpt).length, po = agree / both.length;
  const g1 = both.filter(o => o.gpt === 'A1').length / both.length, m1 = both.filter(o => o.gemini === 'A1').length / both.length;
  const pe = g1 * m1 + (1 - g1) * (1 - m1), kappa = (po - pe) / (1 - pe);
  console.log(`\n=== inter-judge agreement (GPT vs Gemini, k=1 decisive, n=${both.length}) ===`);
  console.log(`  raw agreement ${(100 * po).toFixed(0)}%  Cohen's kappa ${kappa.toFixed(2)} (${kappa >= 0.61 ? 'substantial' : kappa >= 0.41 ? 'moderate' : 'fair/low'})`);
}

// ---- position-bias diagnostics ----
const allCalls = recs;
const slot1wins = allCalls.filter(r => r.verdict.overall_winner === 'A').length;
console.log(`\n=== position-bias diagnostics ===`);
console.log(`  first-slot win-rate ${(100 * slot1wins / allCalls.length).toFixed(1)}% (counterbalancing OK if ~50%)`);
const a1slot1 = allCalls.filter(r => r.slot1_arm === 'A1'); // A1 in slot1 (order2)
const a1slot2 = allCalls.filter(r => r.slot1_arm === 'A0'); // A1 in slot2 (order1)
const a1w1 = a1slot1.filter(r => r.winner_arm === 'A1').length, a1w2 = a1slot2.filter(r => r.winner_arm === 'A1').length;
console.log(`  A1 win-rate when A1 in slot1: ${(100 * a1w1 / a1slot1.length).toFixed(1)}%  | when A1 in slot2: ${(100 * a1w2 / a1slot2.length).toFixed(1)}%  (A1 should win in BOTH)`);

// ---- sub-dimension tallies (answer_first / decisiveness / fabrication) ----
function dimTally(field, mapArmFromAB = true) {
  let a1 = 0, a0 = 0, n = 0;
  for (const r of allCalls) {
    const v = r.verdict[field]; if (v !== 'A' && v !== 'B') continue;
    const arm = v === 'A' ? r.slot1_arm : (r.slot1_arm === 'A0' ? 'A1' : 'A0');
    if (arm === 'A1') a1++; else a0++; n++;
  }
  return { a1, a0, n };
}
console.log(`\n=== sub-dimensions (per-call, arm-resolved) ===`);
for (const f of ['answer_first_winner', 'decisiveness_winner', 'actionability_winner']) {
  const t = dimTally(f); console.log(`  ${f.padEnd(22)} A1 ${t.a1}/${t.n} = ${t.n ? (100 * t.a1 / t.n).toFixed(0) : '-'}%`);
}
// fabrication: who invents MORE (fabrication_more field): A1 inventing less = good
let fabA1 = 0, fabA0 = 0, fabNone = 0;
for (const r of allCalls) { const v = r.verdict.fabrication_more; if (v === 'none' || !v) { fabNone++; continue; } const arm = v === 'A' ? r.slot1_arm : (r.slot1_arm === 'A0' ? 'A1' : 'A0'); if (arm === 'A1') fabA1++; else fabA0++; }
console.log(`  fabrication_more: A1 invents-more ${fabA1}, A0 invents-more ${fabA0}, none ${fabNone}  (lower A1 = better)`);

// ---- length stats + length-stratified win-rate ----
const words = {};
for (const run of RUNS) { try { const px = JSON.parse(fs.readFileSync(path.join(run, 'proxies.json'), 'utf8')); for (const d of px.data) words[`${d.cond}__k${d.k}__${d.id}`] = d.words; } catch {} }
function wc(cond, k, id) { return words[`${cond}__k${k}__${id}`]; }
let a0w = [], a1w = [];
for (const id of qids) for (let k = 1; k <= 2; k++) { const x = wc('A0', k, id), y = wc('A1', k, id); if (x) a0w.push(x); if (y) a1w.push(y); }
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`\n=== length ===`);
console.log(`  mean words  A0 ${mean(a0w).toFixed(0)}  A1 ${mean(a1w).toFixed(0)}  (A1/A0 = ${(mean(a1w) / mean(a0w)).toFixed(2)})`);
// length-stratified: per decisive question, |len_A1-len_A0| at k=1; bin and report A1 win-rate within near-equal stratum
const strat = { near: [], mod: [], large: [] };
for (const q of decidedQ) { const x = wc('A0', 1, q.id), y = wc('A1', 1, q.id); if (!x || !y) continue; const d = Math.abs(y - x); const b = d <= 40 ? 'near' : d <= 120 ? 'mod' : 'large'; strat[b].push(q.win === 'A1' ? 1 : 0); }
for (const [b, arr] of Object.entries(strat)) { const a1 = arr.filter(v => v).length; console.log(`  |Δwords| ${b.padEnd(6)} (n=${arr.length}): A1 win ${arr.length ? (100 * a1 / arr.length).toFixed(0) : '-'}%`); }

// ---- dump machine-readable summary ----
const summary = { n_questions: qids.length, decisive: N, ties, a1wins, winrate: a1wins / N, p_two_sided: p, wilson: wil, bootstrap_ci: ci, flip_rate: flips / pairsBoth, first_slot_winrate: slot1wins / allCalls.length, perQ };
fs.writeFileSync(path.join(JUDGE_OUT, '..', 'analysis-summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nwrote analysis-summary.json`);
