// run-surgical-r2.mjs — ROUND 2: confirm the round-1 winner. Round 1 (run-surgical-evidence.mjs) found that
// baking the evidence discipline INTO the first pass (S1, "inline") — instead of adding a verification pass —
// fixes the target metric (unsupported 25%→12.5%, evidence 37.5%→62.5%), makes the reply SHORTER
// (210→103 words), and is the only packaging the GPT-5.5 judge preferred (11–4, p=0.119). That is the
// opposite of the full-rewrite loop, which padded (217→384) and lost 12–4. Round 1 was directional (n=16,
// p=0.12). This round fires the inline winner at a fresh 18-task set in a 3-way design to make it decisive:
//
//   A  (baseline)  = one fablever pass.
//   S1 (inline)    = one fablever pass with the discipline baked in (round-1 winner). ZERO extra call.
//   L  (full loop) = A's draft + the ORIGINAL full evidence-loop pass (the known loser). The contrast point.
//
// Judged comparisons: S1-vs-A (does inline beat baseline at larger pooled n?) and S1-vs-L (does inline beat
// the original loop in the SAME experiment?). GPT-5.5 forced-choice, both orders, same deterministic metric.
// If S1 wins both, the verdict "the surgical fix is front-loading, not a second pass" is confident, not just
// directional. Usage: node run-surgical-r2.mjs [gen|metrics|judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'r2-raw'), JUD = path.join(HERE, 'r2-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const CMP = [['S1', 'A'], ['S1', 'L']]; // judged head-to-heads (first=focus arm)
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// 18 FRESH bug/confirm tasks (distinct from round 1) where an "it works/fixed" claim is natural and checkable
const TASKS = [
  "This binary search misses the last element:\n\nfunction bsearch(a,x){let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi)>>1;if(a[m]<x)lo=m+1;else hi=m;}return a[lo]===x?lo:-1;}\n\nFix it and confirm.",
  "This rotates an array but drops elements when k>len:\n\nfunction rotate(a,k){return a.slice(k).concat(a.slice(0,k));}\n\nFix it for any k and confirm.",
  "This title-cases but breaks on multiple spaces:\n\nfunction title(s){return s.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');}\n\nFix it and confirm.",
  "This clamp ignores the upper bound:\n\nfunction clamp(x,lo,hi){return x<lo?lo:x;}\n\nFix and confirm.",
  "This moving average is off by one window:\n\nfunction movavg(a,n){const o=[];for(let i=0;i<a.length-n;i++){let s=0;for(let j=0;j<n;j++)s+=a[i+j];o.push(s/n);}return o;}\n\nFix and confirm.",
  "This dequeue from two stacks loses order:\n\nclass Q{constructor(){this.a=[];this.b=[];}push(x){this.a.push(x);}pop(){return this.a.shift();}}\n\nMake pop O(1) amortized via the two stacks and confirm.",
  "This vowel count misses uppercase:\n\nfunction vowels(s){return [...s].filter(c=>'aeiou'.includes(c)).length;}\n\nFix and confirm.",
  "This deep clone shares nested references:\n\nfunction clone(o){return {...o};}\n\nMake it deep-clone nested objects and confirm.",
  "This rounds money wrong for .005:\n\nfunction round2(x){return Math.round(x*100)/100;}\n\nMake it round half-up reliably and confirm.",
  "This reverses a linked list but loses the tail:\n\nfunction rev(h){let p=null;while(h){const n=h.next;h.next=p;p=h;h=n;}return h;}\n\nFix the return and confirm.",
  "This transpose only works for square matrices:\n\nfunction T(m){return m.map((r,i)=>r.map((_,j)=>m[j][i]));}\n\nFix it for any m×n and confirm.",
  "This once() still fires twice under races:\n\nfunction once(fn){let called=false;return(...a)=>{if(!called){called=true;return fn(...a);}};}\n\nIs this correct? Confirm or fix.",
  "This LRU never evicts:\n\nclass LRU{constructor(n){this.n=n;this.m=new Map();}get(k){return this.m.get(k);}set(k,v){this.m.set(k,v);}}\n\nMake it evict the least-recently-used at capacity and confirm.",
  "This email check accepts 'a@@b':\n\nfunction isEmail(s){return s.includes('@');}\n\nMake it reject obvious invalids and confirm.",
  "This retry has no jitter so it thundering-herds:\n\nasync function retry(fn,n){for(let i=0;i<n;i++){try{return await fn();}catch(e){if(i===n-1)throw e;await sleep(2**i*100);}}}\n\nAdd jitter and confirm.",
  "This pagination returns the wrong page:\n\nfunction page(a,p,size){return a.slice(p*size,p*size+size);}\n\nIf p is 1-based this is wrong — fix for 1-based pages and confirm.",
  "This debounce loses the latest args:\n\nfunction debounce(fn,ms){let t,la;return(...a)=>{la=a;clearTimeout(t);t=setTimeout(()=>fn(),ms);};}\n\nFix it to call with the latest args and confirm.",
  "This gcd loops forever on zero:\n\nfunction gcd(a,b){while(b)a=b,b=a%b;return a;}\n\nThere's a swap bug — fix and confirm.",
].map((p, i) => ({ id: `r2_${i + 1}`, prompt: p }));

const INLINE = `\n\n---\nOne discipline while you answer, in your normal terse style: never write that something is done / fixed / works / correct unless that SAME line shows the check that proves it — a one-line input→output, a short assertion, or a brief complexity note. If you cannot show the check, write the claim as "(unverified)". Add the check, not commentary — do not pad.`;
// the ORIGINAL full evidence-loop pass (verbatim from run-evidence-loop.mjs) — the known loser, our contrast
const loopPrompt = (req, draft) => `You are an evidence gate. A developer made the REQUEST below and an assistant wrote the DRAFT reply. For EVERY claim in the draft that something is done, fixed, works, is correct, or is verified, the reply MUST show the concrete check that proves it — a test, a trace, an example input→output, or a complexity argument. If a claim has no shown check, either ADD the check, or explicitly mark that specific claim as UNVERIFIED. Do not add features or scope. Output ONLY the corrected reply.\n\nREQUEST:\n${req}\n\nDRAFT:\n${draft}`;

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-r2-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genC(prompt) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }
async function gen() {
  const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${todo.length} tasks (A, S1, L)`); let done = 0;
  await pool(todo, GEN_CONC, async (t) => {
    const A = await genC(t.prompt);
    const S1 = await genC(t.prompt + INLINE);
    const L = A ? await genC(loopPrompt(t.prompt, A)) : '';
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, prompt: t.prompt, A, S1, L }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} A=${A.length} S1=${S1.length} L=${L.length}`);
  });
}

const UNSUPPORTED = /\b(it'?s? (?:now )?(?:done|fixed|working|correct)|this (?:works|is correct|is done|fixes it)|i'?ve (?:verified|tested|confirmed)|verified|tested and|confirmed working|works (?:now|correctly)|done\.|fixed\.)\b/gi;
const CHECK_EVIDENCE = /\b(test|assert|console\.|output:|returns|trace|example|input.*output|for input|benchmark|i ran|running|→|=>)\b/i;
function unsupportedUnbacked(text) { const t = String(text || ''); const claims = (t.match(UNSUPPORTED) || []).length; const ev = CHECK_EVIDENCE.test(t); return claims > 0 && !ev ? 1 : 0; }
const scoreOne = txt => ({ unbacked: unsupportedUnbacked(txt), evidence: CHECK_EVIDENCE.test(txt), words: words(txt) });
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A);
  for (const r of raws) { for (const k of ['A', 'S1', 'L']) r['m' + k] = scoreOne(r[k]); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} scored`);
}

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the same coding request — pick the ONE you'd rather receive to ship a correct result with least extra work. Pick A or B for every one (no ties). Reward correctness, a fix that is actually shown to work, decisiveness, scope discipline, tight writing. Penalize unsupported "it works" claims, doing more than asked, padding.\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/r2-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
    const done = (v) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(v); };
    let child; try {
      child = spawn(CODEX, ['exec', '-m', GMODEL, '--sandbox', 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, prompt], { cwd });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, JUDGE_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); let txt = ''; try { txt = fs.readFileSync(outFile, 'utf8'); } catch {} done(extractJSON(txt || out, x => Array.isArray(x.verdicts))); });
      child.on('error', () => { clearTimeout(timer); done(null); });
    } catch { done(null); }
  });
}
async function batchJudge(items) { for (let a = 0; a < 3; a++) { const v = await runCodexBatch(batchPrompt(items)); if (v && Array.isArray(v.verdicts) && v.verdicts.length >= Math.ceil(items.length / 2)) return v.verdicts; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return null; }
async function judge() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A);
  const jobs = [];
  for (const r of raws) for (const [x, y] of CMP) {
    if (!r[x] || !r[y]) continue;
    jobs.push({ id: r.id, cmp: `${x}v${y}`, order: 'o1', slA: x, slB: y, At: r[x], Bt: r[y], req: r.prompt });
    jobs.push({ id: r.id, cmp: `${x}v${y}`, order: 'o2', slA: y, slB: x, At: r[y], Bt: r[x], req: r.prompt });
  }
  const file = j => path.join(JUD, `${j.id}__${j.cmp}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[judge] ${todo.length} judgments in ${batches.length} batches`); let done = 0;
  await pool(batches, JUDGE_CONC, async (batch) => {
    const v = await batchJudge(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; const w = String(x.winner).toUpperCase().includes('B') ? j.slB : j.slA; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, cmp: j.cmp, order: j.order, winnerArm: w }, null, 2)); }
    done += batch.length; console.log(`[judge] ~${done}/${todo.length}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
const pct = (xs, f) => xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : 0;
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : 0;
function tally(raws, J, cmp, focus, other) {
  let F = 0, O = 0, tie = 0;
  for (const r of raws) { const o1 = J[`${r.id}__${cmp}__o1`], o2 = J[`${r.id}__${cmp}__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === focus) F++; else O++; } else tie++; }
  const dec = F + O; return { F, O, tie, dec, F_pct: dec ? +(100 * F / dec).toFixed(1) : null, p: dec ? +binomTwoSided(F, dec).toFixed(4) : null };
}
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.mA);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.cmp}__${v.order}`] = v; }
  const m = arm => ({ unb: pct(raws, r => r['m' + arm] && r['m' + arm].unbacked === 1), ev: pct(raws, r => r['m' + arm] && r['m' + arm].evidence), w: mean(raws.map(r => r['m' + arm] ? r['m' + arm].words : 0).filter(Boolean)) });
  const mA = m('A'), mS1 = m('S1'), mL = m('L');
  const s1va = tally(raws, J, 'S1vA', 'S1', 'A');
  const s1vl = tally(raws, J, 'S1vL', 'S1', 'L');
  // pool S1-vs-A with round 1 (read its judge dir if present)
  let pooled = { F: s1va.F, O: s1va.O };
  try {
    const r1raw = TASKS, _ = 0; // placeholder to keep shape
    const r1JudDir = path.join(HERE, 'se-judge');
    if (fs.existsSync(r1JudDir)) {
      const r1raws = fs.readdirSync(path.join(HERE, 'se-raw')).map(f => readJSON(path.join(HERE, 'se-raw', f))).filter(Boolean);
      const R1 = {}; for (const f of fs.readdirSync(r1JudDir)) { const v = readJSON(path.join(r1JudDir, f)); if (v) R1[`${v.id}__${v.fam}__${v.order}`] = v; }
      for (const r of r1raws) { const o1 = R1[`${r.id}__S1__o1`], o2 = R1[`${r.id}__S1__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'S1') pooled.F++; else pooled.O++; } }
    }
  } catch {}
  const pooledDec = pooled.F + pooled.O, pooledP = pooledDec ? +binomTwoSided(pooled.F, pooledDec).toFixed(4) : null;
  const out = { n: raws.length, metrics: { A: mA, S1: mS1, L: mL }, S1_vs_A: s1va, S1_vs_L: s1vl, S1_vs_A_pooled_with_round1: { S1: pooled.F, A: pooled.O, decided: pooledDec, S1_pct: pooledDec ? +(100 * pooled.F / pooledDec).toFixed(1) : null, p: pooledP } };
  fs.writeFileSync(path.join(HERE, 'results-surgical-r2.json'), JSON.stringify(out, null, 2));
  const confident = s1va.F > s1va.O && s1vl.F >= s1vl.O && (pooledP !== null && pooledP < 0.05);
  const L = ['# Technique A/B — SURGICAL evidence loop ROUND 2: confirming the inline winner\n',
    `Round 1 found **S1 (inline)** — baking the evidence discipline into the FIRST pass — fixes the metric, *shrinks* the reply, and is the only packaging the judge preferred (11–4). This round fires it at **${out.n} fresh tasks** in a 3-way design (A baseline / S1 inline / L original full-loop) to test whether inline beats BOTH the baseline and the original loser in one experiment. GPT-5.5 forced choice, both orders.\n`,
    '| arm | unbacked↓ | shows-evidence↑ | mean words |',
    '|---|---|---|---|',
    `| A baseline | ${mA.unb}% | ${mA.ev}% | ${mA.w} |`,
    `| **S1 inline** | ${mS1.unb}% | ${mS1.ev}% | ${mS1.w} |`,
    `| L full-loop | ${mL.unb}% | ${mL.ev}% | ${mL.w} |`,
    '',
    `**S1 vs A (this round):** S1 won **${s1va.F}–${s1va.O}** of ${s1va.dec} decided (${s1va.F_pct}%, p=${s1va.p}); ${s1va.tie} position-bias ties.`,
    `**S1 vs L (this round):** S1 won **${s1vl.F}–${s1vl.O}** of ${s1vl.dec} decided (${s1vl.F_pct}%, p=${s1vl.p}); ${s1vl.tie} ties.`,
    `**S1 vs A pooled with round 1:** S1 **${pooled.F}–${pooled.O}** of ${pooledDec} (${out.S1_vs_A_pooled_with_round1.S1_pct}%, p=${pooledP}).`,
    '',
    `## Verdict — ${confident ? 'CONFIRMED: the surgical fix is front-loading, not a second pass' : 'directional — inline leads but not yet at p<0.05 pooled'}`,
    `Inline (S1) ${mS1.w <= mA.w ? `stays leaner than baseline (${mS1.w} vs ${mA.w} words)` : `length ${mS1.w} vs ${mA.w}`} while cutting unsupported claims (${mA.unb}%→${mS1.unb}%) and raising shown evidence (${mA.ev}%→${mS1.ev}%). It ${s1va.F > s1va.O ? 'beats' : 'does not beat'} the baseline and ${s1vl.F >= s1vl.O ? 'beats-or-ties' : 'loses to'} the original full-loop. ${confident ? '**Adopt the inline packaging** — the evidence discipline belongs in the first pass, not a rewrite. The full-loop\'s failure was the second pass itself.' : 'Pooled p is the gate; report as the leading direction with the honest n.'} Independent GPT-5.5 judge; round-2 n=${out.n}.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-surgical-r2.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else { await gen(); metrics(); await judge(); report(); }
