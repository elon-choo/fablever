// score-human.mjs — score exported human labels against the hidden key, and compare to the GPT-5.5 judges.
// Usage: node score-human.mjs human-labels.json
import fs from 'node:fs'; import path from 'node:path';
const HERE = '/Users/elon/work/fable-profile/eval/comparison/human-anchor';
const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const labelsFile = process.argv[2] || path.join(HERE, 'human-labels.json');
const labels = JSON.parse(fs.readFileSync(labelsFile, 'utf8'));
const key = JSON.parse(fs.readFileSync(path.join(HERE, 'key.json'), 'utf8'));
const CAT = id => id.replace(/[0-9].*$/, '').replace(/_.*/, '').toUpperCase();

function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
function binomGE(k, n) { let s = 0; for (let i = k; i <= n; i++) s += Math.exp(logChoose(n, i) + n * Math.log(0.5)); return s; }
function binom2(k, n) { return n ? Math.min(1, k >= n / 2 ? 2 * binomGE(k, n) : 2 * (1 - binomGE(k + 1, n))) : 1; }
function wilson(k, n, z = 1.96) { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n; const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; }

// resolve each human label to an arm
const rows = [];
for (const [id, r] of Object.entries(labels)) {
  if (!r || !r.pref || !key[id]) continue;
  const prefArm = key[id][r.pref];                 // 'A0' | 'A1'
  const fabArm = r.fab && r.fab !== 'none' ? key[id][r.fab] : 'none';
  rows.push({ id, cat: CAT(id), prefArm, fabArm });
}
const n = rows.length, a1 = rows.filter(r => r.prefArm === 'A1').length;
const w = wilson(a1, n), p = binom2(a1, n);
console.log(`=== HUMAN labels (n=${n} answered) ===`);
console.log(`fablever (A1) preferred: ${a1}/${n} = ${n ? (100 * a1 / n).toFixed(1) : '-'}%`);
console.log(`exact two-sided binomial p = ${p.toFixed(4)} ${p <= 0.05 ? 'SIGNIFICANT' : 'n.s.'}`);
console.log(`Wilson 95% CI = [${(100 * w[0]).toFixed(1)}%, ${(100 * w[1]).toFixed(1)}%]`);
// fabrication
const fabA0 = rows.filter(r => r.fabArm === 'A0').length, fabA1 = rows.filter(r => r.fabArm === 'A1').length, fabN = rows.filter(r => r.fabArm === 'none').length;
console.log(`\nfabrication (humans say invents-more): A0 ${fabA0}, A1 ${fabA1}, neither ${fabN}  (A0/A1 = ${fabA1 ? (fabA0 / fabA1).toFixed(1) : '∞'}x)`);
// per-category
console.log(`\nper-category fablever win-rate:`);
for (const c of ['ACT', 'DEC', 'DBG', 'PLN', 'EXP', 'REV']) { const cr = rows.filter(r => r.cat === c); const ca1 = cr.filter(r => r.prefArm === 'A1').length; if (cr.length) console.log(`  ${c.padEnd(4)} ${ca1}/${cr.length} = ${(100 * ca1 / cr.length).toFixed(0)}%`); }

// agreement with GPT-5.5 judges (generic + personas), per-id winner_arm
function gptWinner(id) {
  // pool generic gpt (k1) + personas; majority arm per id from both-orders gated verdicts
  const dirs = [['preference-battery/judgments', f => f.includes(`${id}__k1__`) && f.includes('__gpt')], ['persona-judgments', f => f.startsWith(`${id}__`)]];
  const votes = [];
  for (const [d, filt] of dirs) { const full = path.join(BASE, d); let files = []; try { files = fs.readdirSync(full).filter(filt); } catch {} const by = {}; for (const f of files) { try { const r = JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')); const tag = (r.persona || 'gpt') + '_' + (r.k || 1); (by[tag] ||= {})[r.order] = r.winner_arm; } catch {} } for (const o of Object.values(by)) if (o[1] && o[2] && o[1] === o[2]) votes.push(o[1]); }
  if (!votes.length) return null; const a = votes.filter(v => v === 'A1').length; return a > votes.length / 2 ? 'A1' : (a < votes.length / 2 ? 'A0' : null);
}
let agree = 0, both = 0, hg = { A1A1: 0, A0A0: 0, A1A0: 0, A0A1: 0 };
for (const r of rows) { const g = gptWinner(r.id); if (!g) continue; both++; if (g === r.prefArm) agree++; hg[r.prefArm + g]++; }
if (both) {
  const po = agree / both; const hA1 = rows.filter(r => r.prefArm === 'A1').length / rows.length; const gA1 = (hg.A1A1 + hg.A0A1) / both;
  const pe = hA1 * gA1 + (1 - hA1) * (1 - gA1), kappa = (po - pe) / (1 - pe || 1);
  console.log(`\n=== human vs GPT-5.5 panel agreement (n=${both}) ===`);
  console.log(`  raw agreement ${(100 * po).toFixed(0)}%  Cohen's kappa ${kappa.toFixed(2)}`);
  console.log(`  (if humans AND GPT both lean A1, the GPT-lens claim gains a real human anchor)`);
}
fs.writeFileSync(path.join(HERE, 'human-score.json'), JSON.stringify({ n, a1, winrate: n ? a1 / n : null, p, wilson: w, fab: { A0: fabA0, A1: fabA1, none: fabN } }, null, 2));
console.log(`\nwrote human-score.json`);
