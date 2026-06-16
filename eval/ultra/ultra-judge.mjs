// Independent judge (GPT-5.2 OpenAI-direct) for the ULTRA pipeline's final confirmed list.
// Scores recall + precision vs planted ground truth, per task and aggregate. Blind to source.
import fs from 'node:fs';
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.argv[3] || 'gpt-5.2';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); // { tasks:[{task_id, planted_defects, confirmed:[...]}], n_candidates_total, agents_total }

async function ask(user) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, max_completion_tokens: 20000,
          messages: [{ role: 'system', content: 'You are an independent strict judge, BLIND to how the submitted defects were produced. For EACH planted defect decide whether the submission CAUGHT it (same underlying issue). Count claimed_total (defects reported) and false_positives (reported defects matching NONE of the planted). Return ONLY JSON: {"per_defect":[{"planted_id":"...","stratum":"a|b|c","caught":true|false}],"claimed_total":N,"false_positives":N}' },
            { role: 'user', content: user }] }),
      });
      if (!r.ok) { if (i < 2) continue; return { _e: r.status }; }
      return JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
    } catch (e) { if (i < 2) continue; return { _e: String(e).slice(0, 120) }; }
  }
}

const strata = { a: { c: 0, t: 0 }, b: { c: 0, t: 0 }, c: { c: 0, t: 0 } };
let fp = 0, claimed = 0;
const perTask = [];
for (const t of data.tasks) {
  const v = await ask('PLANTED DEFECTS:\n' + JSON.stringify(t.planted_defects, null, 1) + '\n\nSUBMISSION (confirmed defects):\n' + JSON.stringify(t.confirmed, null, 1));
  process.stderr.write('.');
  if (!v || v._e) { perTask.push({ task: t.task_id, error: v && v._e }); continue; }
  for (const d of (v.per_defect || [])) { if (!strata[d.stratum]) continue; strata[d.stratum].t++; if (d.caught) strata[d.stratum].c++; }
  fp += v.false_positives || 0; claimed += v.claimed_total || 0;
  perTask.push({ task: t.task_id, caught: (v.per_defect || []).filter(d => d.caught).length, claimed: v.claimed_total, fp: v.false_positives });
}
process.stderr.write('\n');
const rate = s => s.t ? +(s.c / s.t).toFixed(3) : null;
const tp = strata.a.c + strata.b.c + strata.c.c;
const total = strata.a.t + strata.b.t + strata.c.t;
console.log(JSON.stringify({
  judge_model: MODEL,
  recall: { a: rate(strata.a), b: rate(strata.b), c: rate(strata.c), overall: total ? +(tp / total).toFixed(3) : null },
  true_positives: tp, of_planted: total, false_positives: fp, claimed_total: claimed,
  precision: claimed ? +(((claimed - fp) / claimed)).toFixed(3) : null,
  agents_total: data.agents_total, n_candidates_total: data.n_candidates_total,
  per_task: perTask,
}, null, 1));
