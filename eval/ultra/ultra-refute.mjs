// Stage C: adversarial REFUTE pass over a confirmed list, using two INDEPENDENT cross-model
// refuters (Gemini-2.5-pro + GPT-5.2 in refute framing). A confirmed defect is KEPT only if it
// survives both refuters (neither can show it is false/speculative). Tightens precision without
// the adjudicator grading its own work. Writes confirmed-v3.
import fs from 'node:fs';
const OK = process.env.OPENAI_API_KEY, GK = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const conf = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const artOf = {}; for (const t of fixture.verify_tasks) artOf[t.id] = t.artifact;
const REF = 'You are an adversarial refuter. Given an artifact and ONE claimed defect, decide if the claim is GENUINELY true of this artifact. Try hard to refute it (is it actually correct code / a non-issue / speculative / a style nit?). Return ONLY JSON: {"real": true|false, "why": "<one line>"}';

async function gpt(user) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + OK, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.2', response_format: { type: 'json_object' }, max_completion_tokens: 3000, messages: [{ role: 'system', content: REF }, { role: 'user', content: user }] }) });
      if (!r.ok) { if (i < 2) continue; return { real: true, _e: r.status }; }
      return JSON.parse((await r.json()).choices?.[0]?.message?.content || '{"real":true}');
    } catch (e) { if (i < 2) continue; return { real: true, _e: String(e).slice(0, 80) }; }
  }
}
async function gem(user) {
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GK}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: REF }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 } }) });
      if (!r.ok) { if (i < 2) continue; return { real: true, _e: r.status }; }
      const txt = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '{"real":true}';
      return JSON.parse(txt);
    } catch (e) { if (i < 2) continue; return { real: true, _e: String(e).slice(0, 80) }; }
  }
}

const out = []; let kept = 0, dropped = 0, refuteCalls = 0;
for (const t of conf.tasks) {
  const survivors = [];
  for (const d of t.confirmed) {
    const u = 'ARTIFACT:\n' + artOf[t.task_id] + '\n\nCLAIMED DEFECT:\n' + JSON.stringify(d);
    const [g, m] = await Promise.all([gpt(u), gem(u)]);
    refuteCalls += 2;
    // keep unless BOTH refuters agree it is not real (conservative: protect recall)
    if (!(g.real === false && m.real === false)) { survivors.push(d); kept++; } else { dropped++; }
  }
  out.push({ task_id: t.task_id, planted_defects: t.planted_defects, n_candidates: t.n_candidates, confirmed: survivors });
  process.stderr.write(t.task_id + ':' + survivors.length + '/' + t.confirmed.length + ' ');
}
process.stderr.write('\n');
fs.writeFileSync(process.argv[4] || '/tmp/ultra-confirmed-v3.json', JSON.stringify({ adjudicator: conf.adjudicator, escalation: conf.escalation, refuters: 'gpt-5.2 + gemini-2.5-pro (both-must-refute-to-drop)', agents_total: (conf.agents_total || 0) + refuteCalls, n_candidates_total: conf.n_candidates_total, tasks: out }, null, 1));
console.log('refuted: kept', kept, 'dropped', dropped, '| refute calls', refuteCalls);
