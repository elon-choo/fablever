// Robust judge PANEL: scores a confirmed list vs planted ground truth using a cross-model panel
// (GPT-5.2 x4 + Gemini-2.5-pro x1). Per planted defect, MAJORITY vote (>=3 of 5) decides caught.
// Precision = mean over judges. Removes single-judge variance from the headline number.
import fs from 'node:fs';
const OK = process.env.OPENAI_API_KEY, GK = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const SYS = 'You are an independent strict judge, BLIND to how the submitted defects were produced. For EACH planted defect decide whether the submission CAUGHT it (same underlying issue). Count claimed_total (defects reported) and false_positives (reported defects matching NONE of the planted). Return ONLY JSON: {"per_defect":[{"planted_id":"...","stratum":"a|b|c","caught":true|false}],"claimed_total":N,"false_positives":N}';

async function gptJudge(user) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + OK, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.2', response_format: { type: 'json_object' }, max_completion_tokens: 20000, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
      if (!r.ok) { if (i < 2) continue; return { _e: r.status }; }
      return JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
    } catch (e) { if (i < 2) continue; return { _e: String(e).slice(0, 80) }; }
  }
}
async function gemJudge(user) {
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GK}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 } }) });
      if (!r.ok) { if (i < 2) continue; return { _e: r.status }; }
      return JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    } catch (e) { if (i < 2) continue; return { _e: String(e).slice(0, 80) }; }
  }
}

const NJ = 5; // 4 gpt + 1 gemini
const strata = { a: { c: 0, t: 0 }, b: { c: 0, t: 0 }, c: { c: 0, t: 0 } };
let fpSum = 0, claimedSum = 0, jOK = 0;
const perTask = [];
for (const t of data.tasks) {
  const user = 'PLANTED DEFECTS:\n' + JSON.stringify(t.planted_defects, null, 1) + '\n\nSUBMISSION (confirmed defects):\n' + JSON.stringify(t.confirmed, null, 1);
  const judges = await Promise.all([gptJudge(user), gptJudge(user), gptJudge(user), gptJudge(user), gemJudge(user)]);
  // tally votes per planted id
  const votes = {}, stratumOf = {};
  let taskFp = 0, taskClaimed = 0, nValid = 0;
  for (const v of judges) {
    if (!v || v._e || !v.per_defect) continue;
    nValid++;
    for (const d of v.per_defect) { votes[d.planted_id] = (votes[d.planted_id] || 0) + (d.caught ? 1 : 0); stratumOf[d.planted_id] = d.stratum; }
    taskFp += v.false_positives || 0; taskClaimed += v.claimed_total || 0;
  }
  if (!nValid) { perTask.push({ task: t.task_id, error: true }); continue; }
  jOK += nValid;
  const need = Math.ceil(nValid / 2);
  let caughtHere = 0;
  for (const pd of t.planted_defects) {
    const id = pd.id || pd.planted_id || pd.defect_id;
    const s = stratumOf[id] || pd.stratum;
    if (!strata[s]) continue;
    strata[s].t++;
    if ((votes[id] || 0) >= need) { strata[s].c++; caughtHere++; }
  }
  fpSum += taskFp / nValid; claimedSum += taskClaimed / nValid;
  perTask.push({ task: t.task_id, caught: caughtHere, planted: t.planted_defects.length, mean_claimed: +(taskClaimed / nValid).toFixed(1), mean_fp: +(taskFp / nValid).toFixed(1) });
}
const rate = s => s.t ? +(s.c / s.t).toFixed(3) : null;
const tp = strata.a.c + strata.b.c + strata.c.c, total = strata.a.t + strata.b.t + strata.c.t;
console.log(JSON.stringify({
  judge_panel: '4x gpt-5.2 + 1x gemini-2.5-pro, majority vote per planted defect', valid_judge_calls: jOK,
  recall: { a: rate(strata.a), b: rate(strata.b), c: rate(strata.c), overall: total ? +(tp / total).toFixed(3) : null },
  true_positives: tp, of_planted: total,
  mean_claimed: +claimedSum.toFixed(1), mean_false_positives: +fpSum.toFixed(1),
  precision: claimedSum ? +(((claimedSum - fpSum) / claimedSum)).toFixed(3) : null,
  agents_total: data.agents_total, n_candidates_total: data.n_candidates_total, per_task: perTask,
}, null, 1));
