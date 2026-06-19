// persona-judge.mjs — GPT-5.5 (via codex) persona-conditioned judging of A0 vs A1.
// Personas (AI-Elon, AI-Julia) judge "which reply would I rather receive, by MY documented values."
// Both orders, consistency-gated, resumable. Reads persona profiles from /tmp/persona-profiles.json.
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';

const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const RUNS = (process.env.RUNS || `${BASE}/preference-battery,${BASE}/preference-battery-v2`).split(',');
const BATTERIES = (process.env.BATTERIES || '/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery.json,/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery-v2.json').split(',');
const JOUT = process.env.JOUT || (BASE + '/persona-judgments');
const CONC = parseInt(process.env.CONC || '3', 10);
const KK = 1; // k=1 to keep codex volume manageable
fs.mkdirSync(JOUT, { recursive: true });

const personas = JSON.parse(fs.readFileSync('/tmp/persona-profiles.json', 'utf8')); // {elon:{judge_persona}, julia:{judge_persona}}
const Q = {};
for (const b of BATTERIES) { const o = JSON.parse(fs.readFileSync(b, 'utf8')); for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) Q[k] = v; }
function find(cond, k, id) { for (const r of RUNS) { try { const t = fs.readFileSync(path.join(r, cond, `k${k}`, id + '.txt'), 'utf8'); if (t && t.trim()) return t; } catch {} } return null; }

function rubric(personaPara, question, ansA, ansB) {
  return `${personaPara}

You are judging which of two answers (A and B) to the developer question below you would personally rather RECEIVE, judged strictly BY YOUR OWN values described above (including your own preference about length, directness, and structure — do not adopt anyone else's standard).

=== QUESTION ===
${question}

=== Assistant A ===
${ansA}

=== Assistant B ===
${ansB}

Reason per-criterion first (cite a short span each), verdict LAST. Return ONLY a single-line minified JSON object with EXACTLY these keys:
{"answer_first":"<which states the actionable answer in sentence 1 vs buries it; cite a span>","decisiveness":"<which commits to ONE recommendation vs surveys options>","fabrication":"<does either invent details never given? quote it or 'none'>","actionability":"<which is easier to act on>","answer_first_winner":"A or B","decisiveness_winner":"A or B","actionability_winner":"A or B","fabrication_more":"A or B or none","confidence":"low or med or high","overall_winner":"A or B"}
No text outside the JSON object.`;
}

function extractJSON(s) {
  const idxs = []; for (let i = 0; i < s.length; i++) if (s[i] === '{') idxs.push(i);
  for (let j = idxs.length - 1; j >= 0; j--) {
    let depth = 0, inStr = false, esc = false;
    for (let i = idxs[j]; i < s.length; i++) { const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { try { const o = JSON.parse(s.slice(idxs[j], i + 1)); if (o && o.overall_winner) return o; } catch {} break; } } }
  }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function callGPT(prompt) {
  return new Promise(resolve => {
    const run = (attempt) => {
      const ch = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
      ch.on('close', async () => {
        const o = extractJSON(out); if (o) return resolve(o);
        if (/rate limit|429|quota|usage limit/i.test(out + err) && attempt < 4) { await sleep(8000 * (attempt + 1)); return run(attempt + 1); }
        if (attempt < 3) { await sleep(3000); return run(attempt + 1); }
        resolve(null);
      });
      ch.stdin.write(prompt); ch.stdin.end();
    };
    run(0);
  });
}

const ids = Object.keys(Q);
const tasks = [];
for (const persona of Object.keys(personas)) for (const id of ids) for (const order of [1, 2]) {
  const a0 = find('A0', 1, id), a1 = find('A1', 1, id); if (!a0 || !a1) continue;
  const outf = path.join(JOUT, `${id}__o${order}__${persona}.json`);
  if (fs.existsSync(outf)) continue;
  tasks.push({ persona, id, order, a0, a1, outf });
}
console.log(`pending persona judgments: ${tasks.length}`);
let done = 0;
async function runTask(t) {
  const slot1_arm = t.order === 1 ? 'A0' : 'A1';
  const ansA = t.order === 1 ? t.a0 : t.a1, ansB = t.order === 1 ? t.a1 : t.a0;
  const v = await callGPT(rubric(personas[t.persona].judge_persona, Q[t.id], ansA, ansB));
  if (v) { const rec = { id: t.id, order: t.order, persona: t.persona, slot1_arm, ok: true, verdict: v, winner_arm: v.overall_winner === 'A' ? slot1_arm : (slot1_arm === 'A0' ? 'A1' : 'A0') };
    fs.writeFileSync(t.outf, JSON.stringify(rec)); }
  done++; if (done % 15 === 0 || !v) console.log(`[${done}/${tasks.length}] ${t.id} o${t.order} ${t.persona} -> ${v ? 'ok' : 'FAIL'}`);
}
let i = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (i < tasks.length) await runTask(tasks[i++]); }));
console.log(`DONE persona judging -> ${JOUT}`);
