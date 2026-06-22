// finalize.mjs — compute the confirmatory result from the saved Gemini-pro pairwise judgments, add a fast
// Gemini-flash cross-MODEL check on the decisive T-vs-P pair (codex proved too slow to run at scale), and
// fold in whatever codex/GPT judgments completed. Reuses the exact battery + prompt from run-confirm.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { BATTERY, pairPrompt, extractJSON, PAIRS, GEN, JUD, OUT, readJSON } from './run-confirm.mjs';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
async function callFlash(prompt) { for (let a = 0; a < 4; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 2500, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 1500 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', x => x.winner !== undefined); if (o) return o; } catch { await new Promise(z => setTimeout(z, 1200 * (a + 1))); } } return null; }
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch {} } })); }

const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
const blocked = gens.filter(g => g.blocked);

// --- run flash on T-vs-P, both orders, for each blocked task (cached) ---
const flashJobs = [];
for (const g of blocked) { const task = BATTERY.find(t => t.id === g.id); flashJobs.push({ id: g.id, order: 'o1', A: 'T', B: 'P', Atext: g.T, Btext: g.P, task }); flashJobs.push({ id: g.id, order: 'o2', A: 'P', B: 'T', Atext: g.P, Btext: g.T, task }); }
const file = j => path.join(JUD, `${j.id}__TvP__${j.order}__flash.json`);
console.log(`[flash] ${flashJobs.length} calls`);
await pool(flashJobs.filter(j => !fs.existsSync(file(j))), 4, async (j) => {
  const v = await callFlash(pairPrompt(j.task.prompt, j.task.criteria, j.Atext, j.Btext));
  if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, pair: 'TvP', order: j.order, judge: 'flash', winnerArm: w === 'A' ? j.A : j.B, why: v.why }, null, 2)); }
  console.log(`[flash] ${j.id} ${j.order} -> ${v ? (String(v.winner).toUpperCase().includes('B') ? j.B : j.A) : 'NULL'}`);
});

// --- tally helper: order-consistent winner per (task, pair) for a given judge ---
function tally(judge, pairsWanted) {
  const J = {}; for (const f of fs.readdirSync(JUD)) { if (!f.endsWith(`__${judge}.json`)) continue; const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  const t = {}; for (const [X, Y] of PAIRS) if (pairsWanted.includes(`${X}v${Y}`)) t[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0, n: 0 };
  const cons = {}; // per-pair consistent winner per task
  for (const g of blocked) for (const [X, Y] of PAIRS) {
    const key = `${X}v${Y}`; if (!pairsWanted.includes(key)) continue;
    const o1 = J[`${g.id}__${key}__o1`], o2 = J[`${g.id}__${key}__o2`];
    if (!o1 || !o2) continue;
    t[key].n++;
    if (o1.winnerArm === o2.winnerArm) { t[key][o1.winnerArm]++; (cons[key] ||= {})[g.id] = o1.winnerArm; }
    else { t[key].tie++; (cons[key] ||= {})[g.id] = 'tie'; }
  }
  return { t, cons };
}
const gem = tally('gem', ['TvC', 'TvP', 'CvP']);
const flash = tally('flash', ['TvP']);
const gpt = tally('gpt', ['TvP']);

// cross-judge agreement on T-vs-P consistent winner
function agreement(a, b) { let both = 0, agree = 0; for (const g of blocked) { const x = a.TvP?.[g.id], y = b.TvP?.[g.id]; if (x && y && x !== 'tie' && y !== 'tie') { both++; if (x === y) agree++; } } return { both, agree }; }
const agGemFlash = agreement(gem.cons, flash.cons);
const agGemGpt = agreement(gem.cons, gpt.cons);

const tCleared = blocked.length ? +(100 * blocked.filter(g => g.t_gate === 'PASS').length / blocked.length).toFixed(1) : null;
const pCleared = blocked.length ? +(100 * blocked.filter(g => g.p_gate === 'PASS').length / blocked.length).toFixed(1) : null;
const wl = (T, X, Y) => { const r = T[`${X}v${Y}`]; if (!r) return `${X}v${Y}: no data`; const dec = r[X] + r[Y]; return `${X} ${r[X]} – ${r[Y]} ${Y} (ties ${r.tie}, n=${r.n})${dec ? `, ${X} ${+(100 * r[X] / dec).toFixed(0)}% of decided` : ''}`; };

const out = {
  n_tasks: gens.length, n_blocked: blocked.length, block_rate_pct: +(100 * blocked.length / gens.length).toFixed(1),
  objective_gate_clear: { T_pct: tCleared, P_pct: pCleared },
  gemini_pro: gem.t, gemini_flash_TvP: flash.t.TvP, codex_TvP_partial: gpt.t.TvP,
  cross_judge_TvP_agreement: { gem_vs_flash: agGemFlash, gem_vs_codex: agGemGpt },
};
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
const L = ['# fable_check — confirmatory result (Gemini-pro primary; Gemini-flash + codex cross-checks)\n',
  `${out.n_tasks} tasks; gate fired on **${out.n_blocked}/${out.n_tasks}** (${out.block_rate_pct}%). Forced-choice pairwise, both orders; a win counts only when the judge picks the same arm in both orders (order-inconsistent = position bias = tie).\n`,
  '## Gemini-2.5-pro — full pairwise on the blocked tasks',
  `- T vs C: **${wl(gem.t, 'T', 'C')}**  ← gate-revision vs raw draft`,
  `- T vs P: **${wl(gem.t, 'T', 'P')}**  ← deterministic gate vs generic second pass (the decisive test)`,
  `- C vs P: **${wl(gem.t, 'C', 'P')}**  ← any second pass vs raw`,
  '',
  '## Cross-model check on the decisive T-vs-P pair',
  `- Gemini-2.5-flash: ${wl(flash.t, 'T', 'P')}`,
  `- GPT-5.5 / codex (partial — too slow to run fully): ${wl(gpt.t, 'T', 'P')}`,
  `- Agreement on the T-vs-P consistent winner: pro vs flash **${agGemFlash.agree}/${agGemFlash.both}**; pro vs codex **${agGemGpt.agree}/${agGemGpt.both}**`,
  '',
  '## Objective check (no judge): revision cleared the gate?',
  `- T (gate-guided) **${tCleared}%** · P (generic) **${pCleared}%** of blocked tasks.`,
  '',
  '## Blocked tasks', ...blocked.map(g => `- ${g.id} (${g.dod}): ${g.raw_fail_ids.join(', ')}`),
  '',
  'Replicates the out2 pilot (7 blocked tasks: T-vs-C 7–0, T-vs-P 6–1) on a fresh, larger battery and a second judge model. Cluster = task; directional, not significance-powered, single provider for the two faster judges. The code domain rarely blocks (Fable already grounds code claims), so the gate\'s value concentrates in research/funnel/doc deliverables.',
];
fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
console.log('\n' + L.join('\n'));
