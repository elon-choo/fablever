// ULTRA pipeline stage 3: ADJUDICATE the wide candidate union (Claude panel+draws UNION Gemini)
// with the strongest cross-model reasoner (GPT-5.2), filtering false positives + duplicates ->
// a confirmed, deduped defect list per artifact (precision recovery). No big paste: runs in main loop.
import fs from 'node:fs';
const KEY = process.env.OPENAI_API_KEY;
const ADJ = process.argv[5] || 'gpt-5.2';
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));     // hard fixture (artifacts + planted)
const claudeGen = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));   // {worker, tasks:[{id, planted_defects, claudeCands, agents}]}
const gem = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));         // {task_id: [findings]}

const artOf = {}; for (const t of fixture.verify_tasks) artOf[t.id] = t.artifact;
const claudeOf = {}; for (const t of claudeGen.tasks) claudeOf[t.id] = t;

async function adjudicate(artifact, union) {
  const sys = 'You are the FINAL adjudicator. You are given an artifact and a UNION of candidate defects collected from many independent reviewers (multiple models, multiple lenses). The union has DUPLICATES, near-duplicates, and FALSE POSITIVES / hallucinations (claims not actually true of this artifact). Your job: output the DEDUPED list of defects that are GENUINELY PRESENT in this artifact. Merge duplicates into one entry. DROP anything that is not actually true of the artifact, is speculative, or is a style nit rather than a defect. Be rigorous and precise — an included false positive is as damaging as a missed defect. Keep real subtle deep-reasoning defects. Return ONLY JSON: {"confirmed":[{"claim":"<one-line defect>","evidence":"<why it is real, grounded in the artifact>","severity":"blocker|major|minor"}]}';
  const user = 'ARTIFACT:\n' + artifact + '\n\nCANDIDATE DEFECTS (union, may contain duplicates / false positives):\n' + JSON.stringify(union, null, 1);
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ADJ, response_format: { type: 'json_object' }, max_completion_tokens: 30000, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
      });
      if (!r.ok) { if (i < 2) continue; return { confirmed: [], _e: r.status }; }
      return JSON.parse((await r.json()).choices?.[0]?.message?.content || '{"confirmed":[]}');
    } catch (e) { if (i < 2) continue; return { confirmed: [], _e: String(e).slice(0, 120) }; }
  }
}

const tasksOut = [];
let agents = 0, nCand = 0;
for (const t of fixture.verify_tasks) {
  const cg = claudeOf[t.id] || { claudeCands: [], agents: 0 };
  const union = (cg.claudeCands || []).concat(gem[t.id] || []);
  agents += (cg.agents || 0) + 2 /*gemini gen*/ + 1 /*adjudicator*/;
  nCand += union.length;
  const adj = await adjudicate(artOf[t.id], union);
  process.stderr.write(t.id + ':' + (adj.confirmed || []).length + '/' + union.length + ' ');
  tasksOut.push({ task_id: t.id, planted_defects: t.planted_defects, n_candidates: union.length, confirmed: adj.confirmed || [] });
}
process.stderr.write('\n');
fs.writeFileSync('/tmp/ultra-confirmed.json', JSON.stringify({ adjudicator: ADJ, agents_total: agents, n_candidates_total: nCand, tasks: tasksOut }, null, 1));
console.log('adjudicated', tasksOut.length, 'tasks | total candidates:', nCand, '| confirmed:', tasksOut.reduce((s, t) => s + t.confirmed.length, 0), '| pipeline agents ~', agents);
