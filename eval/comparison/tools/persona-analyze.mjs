// persona-analyze.mjs — compare generic GPT-5.5 vs AI-Elon vs AI-Julia on the same A0/A1 battery.
// All three are GPT-5.5-based, k=1, both-orders consistency-gated. Shows what the persona adds over base GPT.
import fs from 'node:fs'; import path from 'node:path';
const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const PJ = BASE + '/persona-judgments';
const GJ = BASE + '/preference-battery/judgments';
const CAT = id => id.replace(/[0-9].*$/, '').replace(/_.*/, '').toUpperCase();

function load(dir, filter) { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(r => r && r.ok && r.verdict && filter(r)); }

// generic GPT, k=1 only (to match persona k=1)
const genGpt = load(GJ, r => r.judge === 'gpt' && r.k === 1).map(r => ({ ...r, src: 'generic-gpt' }));
const persona = load(PJ, () => true).map(r => ({ ...r, src: r.persona }));
const all = [...genGpt, ...persona];

function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
function binomGE(k, n) { let s = 0; for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + n * Math.log(0.5)); return s; }
function binom2(k, n) { return Math.min(1, k >= n / 2 ? 2 * binomGE(k, n) : 2 * (1 - binomGE(k + 1, n))); }
function wilson(k, n, z = 1.96) { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n; const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; }
function armOf(r, ab) { return ab === 'A' ? r.slot1_arm : (r.slot1_arm === 'A0' ? 'A1' : 'A0'); }

function analyzeSrc(src) {
  const rs = all.filter(r => r.src === src);
  // gate per id
  const byId = {}; for (const r of rs) (byId[r.id] ||= {})[r.order] = r;
  const gated = []; let flips = 0, both = 0;
  for (const [id, o] of Object.entries(byId)) { if (!o[1] || !o[2]) continue; both++; const dec = o[1].winner_arm === o[2].winner_arm; if (!dec) flips++; gated.push({ id, cat: CAT(id), decisive: dec, winner: dec ? o[1].winner_arm : null }); }
  const dec = gated.filter(g => g.decisive); const a1 = dec.filter(g => g.winner === 'A1').length, n = dec.length;
  const w = wilson(a1, n), p = binom2(a1, n);
  // position
  const fs1 = rs.filter(r => r.verdict.overall_winner === 'A').length;
  const a1s1 = rs.filter(r => r.slot1_arm === 'A1'), a1s2 = rs.filter(r => r.slot1_arm === 'A0');
  const w1 = a1s1.filter(r => r.winner_arm === 'A1').length, w2 = a1s2.filter(r => r.winner_arm === 'A1').length;
  // subdims
  function dim(f) { let A1 = 0, t = 0; for (const r of rs) { const v = r.verdict[f]; if (v !== 'A' && v !== 'B') continue; if (armOf(r, v) === 'A1') A1++; t++; } return t ? Math.round(100 * A1 / t) : null; }
  let fbA0 = 0, fbA1 = 0; for (const r of rs) { const v = r.verdict.fabrication_more; if (v === 'none' || !v) continue; if (armOf(r, v) === 'A1') fbA1++; else fbA0++; }
  // per-category
  const cats = {}; for (const c of ['ACT', 'DEC', 'DBG', 'PLN', 'EXP', 'REV']) { const qs = dec.filter(g => g.cat === c); cats[c] = qs.length ? Math.round(100 * qs.filter(g => g.winner === 'A1').length / qs.length) : null; }
  return { src, calls: rs.length, decisive: n, ties: gated.length - n, a1, winrate: n ? Math.round(100 * a1 / n) : null, wilson: [Math.round(100 * w[0]), Math.round(100 * w[1])], p: +p.toFixed(4), firstSlot: rs.length ? Math.round(100 * fs1 / rs.length) : null, a1slot1: a1s1.length ? Math.round(100 * w1 / a1s1.length) : null, a1slot2: a1s2.length ? Math.round(100 * w2 / a1s2.length) : null, answer_first: dim('answer_first_winner'), decisiveness: dim('decisiveness_winner'), fab_A0more: fbA0, fab_A1more: fbA1, cats };
}

const srcs = ['generic-gpt', 'elon', 'julia'].filter(s => all.some(r => r.src === s));
const res = srcs.map(analyzeSrc);
console.log('=== GPT-5.5 judge: generic vs AI-Elon vs AI-Julia (k=1, both-orders gated, A0 vs A1) ===\n');
console.log('metric'.padEnd(22) + srcs.map(s => s.padEnd(14)).join(''));
const row = (lbl, fn) => console.log(lbl.padEnd(22) + res.map(r => String(fn(r)).padEnd(14)).join(''));
row('calls', r => r.calls);
row('decisive/ties', r => `${r.decisive}/${r.ties}`);
row('A1 win-rate %', r => r.winrate);
row('  Wilson 95%', r => `[${r.wilson[0]},${r.wilson[1]}]`);
row('  exact p', r => r.p + (r.p <= 0.05 ? '*' : ''));
row('first-slot %', r => r.firstSlot);
row('A1 slot1/slot2 %', r => `${r.a1slot1}/${r.a1slot2}`);
row('answer_first A1 %', r => r.answer_first);
row('decisiveness A1 %', r => r.decisiveness);
row('fab: A0more/A1more', r => `${r.fab_A0more}/${r.fab_A1more}`);
console.log('\n--- per-category A1 win-rate % ---');
console.log('cat'.padEnd(22) + srcs.map(s => s.padEnd(14)).join(''));
for (const c of ['ACT', 'DEC', 'DBG', 'PLN', 'EXP', 'REV']) console.log(c.padEnd(22) + res.map(r => String(r.cats[c]).padEnd(14)).join(''));
fs.writeFileSync(BASE + '/persona-analysis.json', JSON.stringify(res, null, 2));
console.log('\nwrote persona-analysis.json');
