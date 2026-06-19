// judge-run.mjs — blind, both-orders, consistency-gated 2-judge panel for the fablever preference study.
// Judges: Gemini-2.5-pro (Google API) + GPT-5.5 (via `codex exec`; OpenAI API key has no quota, codex uses ChatGPT auth).
// Resumable: one verdict JSON per (id,k,order,judge) under JUDGE_OUT; existing files are skipped. Re-run until complete.
//
// Env:
//   RUNS   comma-sep run dirs holding cond/k{n}/id.txt (default: the two battery dirs)
//   BATTERIES comma-sep prompt json files for id->question (default: the two battery files)
//   JUDGE_OUT  output dir for verdicts (default: <first RUN>/judgments)
//   JUDGES gemini,gpt  (default both)
//   GEM_KK 2   GPT_KK 1   per-judge number of k-pairs to judge (GPT defaults lower to spare ChatGPT quota)
//   CONC_GEM 8   CONC_GPT 3   concurrency per judge
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';

const BASE = '/Users/elon/work/fable-profile/eval/comparison/runs/2026-06-19';
const RUNS = (process.env.RUNS || `${BASE}/preference-battery,${BASE}/preference-battery-v2`).split(',');
const BATTERIES = (process.env.BATTERIES || '/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery.json,/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery-v2.json').split(',');
const JUDGE_OUT = process.env.JUDGE_OUT || (RUNS[0] + '/judgments');
const JUDGES = (process.env.JUDGES || 'gemini,gpt').split(',');
const GEM_KK = parseInt(process.env.GEM_KK || '2', 10);
const GPT_KK = parseInt(process.env.GPT_KK || '1', 10);
const CONC_GEM = parseInt(process.env.CONC_GEM || '8', 10);
const CONC_GPT = parseInt(process.env.CONC_GPT || '3', 10);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
fs.mkdirSync(JUDGE_OUT, { recursive: true });

// id -> question
const Q = {};
for (const b of BATTERIES) { const o = JSON.parse(fs.readFileSync(b, 'utf8')); for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) Q[k] = v; }

function readResp(run, cond, k, id) {
  const p = path.join(run, cond, `k${k}`, id + '.txt');
  try { const t = fs.readFileSync(p, 'utf8'); return t && t.trim() ? t : null; } catch { return null; }
}
// find which run dir holds a given id (search all)
function find(cond, k, id) { for (const r of RUNS) { const t = readResp(r, cond, k, id); if (t) return t; } return null; }

function rubric(question, ansA, ansB) {
  return `You are the busy software developer who ASKED the question below and must act on the answer NOW. Two assistants (A and B) each answered. Pick the reply that gets YOUR work done fastest and most reliably.

The two answers may differ greatly in length. Do NOT reward an answer for being longer or more detailed. At equal correctness, prefer the answer that lets you act faster; a concise AND complete answer is better than a longer one that buries the answer or pads with boilerplate.

=== QUESTION ===
${question}

=== Assistant A ===
${ansA}

=== Assistant B ===
${ansB}

First reason per-criterion (each note citing a specific phrase/span from A or B), THEN give the verdict LAST.
Return ONLY a single-line minified JSON object with EXACTLY these keys:
{"answer_first":"<which states the actionable answer in sentence 1 vs buries it; cite a span>","decisiveness":"<which commits to ONE recommendation vs surveys options; cite a span>","fabrication":"<does either invent repo/file/API details the asker never gave? quote the invented span, or 'none'>","actionability":"<which is easier to act on right now>","answer_first_winner":"A or B","decisiveness_winner":"A or B","actionability_winner":"A or B","fabrication_more":"A or B or none","length_neutrality_ack":true,"confidence":"low or med or high","overall_winner":"A or B"}
No text outside the JSON object.`;
}

// robust: last brace-balanced JSON object containing overall_winner
function extractJSON(s) {
  const idxs = []; for (let i = 0; i < s.length; i++) if (s[i] === '{') idxs.push(i);
  for (let j = idxs.length - 1; j >= 0; j--) {
    let depth = 0, inStr = false, esc = false;
    for (let i = idxs[j]; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { const cand = s.slice(idxs[j], i + 1); try { const o = JSON.parse(cand); if (o && o.overall_winner) return o; } catch {} break; } }
    }
  }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGemini(prompt) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000, temperature: 0 } }),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      const o = extractJSON(txt); if (o) return o;
      await sleep(1500 * (attempt + 1));
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

function callGPT(prompt) {
  return new Promise(resolve => {
    const run = (attempt) => {
      const ch = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
      ch.on('close', async () => {
        const o = extractJSON(out);
        if (o) return resolve(o);
        if (/rate limit|429|quota|usage limit/i.test(out + err) && attempt < 4) { await sleep(8000 * (attempt + 1)); return run(attempt + 1); }
        if (attempt < 3) { await sleep(3000); return run(attempt + 1); }
        resolve(null);
      });
      ch.stdin.write(prompt); ch.stdin.end();
    };
    run(0);
  });
}

// build task list
const ids = Object.keys(Q);
const tasks = [];
for (const judge of JUDGES) {
  const KK = judge === 'gpt' ? GPT_KK : GEM_KK;
  for (const id of ids) for (let k = 1; k <= KK; k++) for (const order of [1, 2]) {
    const a0 = find('A0', k, id), a1 = find('A1', k, id);
    if (!a0 || !a1) continue; // both arms must exist
    const outf = path.join(JUDGE_OUT, `${id}__k${k}__o${order}__${judge}.json`);
    if (fs.existsSync(outf)) continue; // resumable
    tasks.push({ judge, id, k, order, a0, a1, outf });
  }
}
console.log(`pending judgments: ${tasks.length} (gemini conc ${CONC_GEM}, gpt conc ${CONC_GPT})`);

let done = 0;
async function runTask(t) {
  const slot1_arm = t.order === 1 ? 'A0' : 'A1';
  const ansA = t.order === 1 ? t.a0 : t.a1;
  const ansB = t.order === 1 ? t.a1 : t.a0;
  const prompt = rubric(Q[t.id], ansA, ansB);
  const v = t.judge === 'gemini' ? await callGemini(prompt) : await callGPT(prompt);
  const rec = { id: t.id, k: t.k, order: t.order, judge: t.judge, slot1_arm, ok: !!v, verdict: v };
  if (v) {
    rec.winner_arm = (v.overall_winner === 'A') ? slot1_arm : (slot1_arm === 'A0' ? 'A1' : 'A0');
    fs.writeFileSync(t.outf, JSON.stringify(rec)); // only persist successes -> retries re-attempt failures
  }
  done++; if (done % 20 === 0 || !v) console.log(`[${done}/${tasks.length}] ${t.id} k${t.k} o${t.order} ${t.judge} -> ${rec.winner_arm || 'FAIL(no file)'}`);
}

async function pool(items, conc) {
  let i = 0; const workers = Array.from({ length: conc }, async () => { while (i < items.length) { const t = items[i++]; await runTask(t); } });
  await Promise.all(workers);
}

const gem = tasks.filter(t => t.judge === 'gemini');
const gpt = tasks.filter(t => t.judge === 'gpt');
await Promise.all([pool(gem, CONC_GEM), pool(gpt, CONC_GPT)]);
console.log(`DONE. wrote ${done} verdicts to ${JUDGE_OUT}`);
