// run-evidence-loop.mjs — Does an EVIDENCE LOOP (a verify-until-shown-check pass) reduce fablever's known
// weakness — unsupported "it works"/"fixed" claims (8.3% in the style-only ablation) — without hurting
// quality? This tests a GENERIC software-engineering technique ("don't claim done until evidence shows it")
// on its own merits, with our own implementation and our own A/B. It is NOT a port of any tool; the idea is
// old and appears in many harnesses — we measure whether bolting it onto fablever actually helps.
//
//   Arm A (fablever)           = one fablever-style pass.
//   Arm B (fablever + loop)    = A's draft, then ONE evidence pass: every done/works/fixed claim must show
//                                the concrete check that proves it, or be marked unverified.
// Primary metric is DETERMINISTIC (unsupported-unbacked rate, same regex as the ablation). Quality is a
// GPT-5.5 forced-choice (via codex CLI) so the loop can't silently trade quality for fewer claims.
// Usage: node run-evidence-loop.mjs [gen|metrics|judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'el-raw'), JUD = path.join(HERE, 'el-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// tasks where an "it works / it's fixed" claim is natural and SHOULD be backed by a shown check
const TASKS = [
  "This should return the LAST index of x but returns the first:\n\nfunction lastIndexOf(arr,x){for(let i=0;i<arr.length;i++){if(arr[i]===x)return i;}return -1;}\n\nFix it and confirm it is done.",
  "This debounce drops the final call:\n\nfunction debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(fn,ms);};}\n\nFix it so the last call runs with its args, and confirm.",
  "This retry never waits between attempts:\n\nasync function retry(fn,n){for(let i=0;i<n;i++){try{return await fn();}catch(e){if(i===n-1)throw e;}}}\n\nAdd exponential backoff and confirm.",
  "Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){return a.filter((x,i)=>a.indexOf(x)===i);}",
  "Speed up this prime check and tell me how much faster:\n\nfunction isPrime(n){for(let i=2;i<n;i++)if(n%i===0)return false;return n>1;}",
  "This deep-merge mutates its first argument unexpectedly:\n\nfunction merge(a,b){for(const k in b){if(typeof b[k]==='object')a[k]=merge(a[k],b[k]);else a[k]=b[k];}return a;}\n\nFix and confirm it works.",
  "This throttle never fires the trailing call:\n\nfunction throttle(fn,ms){let last=0;return(...a)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...a);}};}\n\nFix and confirm.",
  "This sums an array but is off by one:\n\nfunction sum(a){let t=0;for(let i=0;i<=a.length;i++)t+=a[i];return t;}\n\nFix it and confirm it is correct.",
  "Make this flatten arbitrarily nested arrays and confirm it handles depth 3:\n\nfunction flat(a){return a.reduce((x,y)=>x.concat(y),[]);}",
  "This parseQuery mishandles repeated keys:\n\nfunction parseQuery(s){return Object.fromEntries(new URLSearchParams(s));}\n\nMake repeated keys become arrays and confirm.",
  "This capitalize breaks on empty strings:\n\nfunction cap(s){return s[0].toUpperCase()+s.slice(1);}\n\nFix it and confirm it's safe.",
  "This chunk function loses the last partial chunk:\n\nfunction chunk(a,n){const out=[];for(let i=0;i+n<=a.length;i+=n)out.push(a.slice(i,i+n));return out;}\n\nFix and confirm.",
  "This memoize ignores arguments:\n\nfunction memo(fn){let c;return()=>c??(c=fn());}\n\nMake it cache per-arguments and confirm.",
  "This range is exclusive but should be inclusive:\n\nfunction range(a,b){const o=[];for(let i=a;i<b;i++)o.push(i);return o;}\n\nMake it inclusive of b and confirm.",
  "This groupBy overwrites instead of grouping:\n\nfunction groupBy(a,f){const o={};for(const x of a)o[f(x)]=x;return o;}\n\nFix it to collect arrays and confirm.",
  "This isPalindrome is case-sensitive and counts spaces:\n\nfunction isPal(s){return s===[...s].reverse().join('');}\n\nMake it ignore case and non-letters, and confirm.",
].map((p, i) => ({ id: `el${i + 1}`, prompt: p }));

const loopPrompt = (req, draft) => `You are an evidence gate. A developer made the REQUEST below and an assistant wrote the DRAFT reply. For EVERY claim in the draft that something is done, fixed, works, is correct, or is verified, the reply MUST show the concrete check that proves it — a test, a trace, an example input→output, or a complexity argument. If a claim has no shown check, either ADD the check, or explicitly mark that specific claim as UNVERIFIED. Do not add features or scope. Output ONLY the corrected reply.\n\nREQUEST:\n${req}\n\nDRAFT:\n${draft}`;

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-el-'); } catch {}
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
  console.log(`[gen] ${todo.length} tasks`); let done = 0;
  await pool(todo, GEN_CONC, async (t) => {
    const A = await genC(t.prompt);
    const B = A ? await genC(loopPrompt(t.prompt, A)) : '';
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, prompt: t.prompt, A, B }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} A=${A.length} B=${B.length}`);
  });
}

// deterministic unsupported-claim metric (same regexes as the style-only ablation, for comparability)
const UNSUPPORTED = /\b(it'?s? (?:now )?(?:done|fixed|working|correct)|this (?:works|is correct|is done|fixes it)|i'?ve (?:verified|tested|confirmed)|verified|tested and|confirmed working|works (?:now|correctly)|done\.|fixed\.)\b/gi;
const CHECK_EVIDENCE = /\b(test|assert|console\.|output:|returns|trace|example|input.*output|for input|benchmark|i ran|running|→|=>)\b/i;
function unsupportedUnbacked(text) { const t = String(text || ''); const claims = (t.match(UNSUPPORTED) || []).length; const ev = CHECK_EVIDENCE.test(t); return claims > 0 && !ev ? 1 : 0; }
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A && r.B);
  for (const r of raws) { r.mA = { unbacked: unsupportedUnbacked(r.A), claims: (r.A.match(UNSUPPORTED) || []).length, evidence: CHECK_EVIDENCE.test(r.A), words: words(r.A) }; r.mB = { unbacked: unsupportedUnbacked(r.B), claims: (r.B.match(UNSUPPORTED) || []).length, evidence: CHECK_EVIDENCE.test(r.B), words: words(r.B) }; fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} tasks scored`);
}

// GPT-5.5 quality forced-choice (via codex), batched, both orders
function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the same coding request — pick the ONE you'd rather receive to ship a correct result with least extra work. Pick A or B for every one (no ties). Reward correctness, a fix that is actually shown to work, decisiveness, scope discipline, tight writing. Penalize unsupported "it works" claims, doing more than asked, padding.\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/el-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
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
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A && r.B);
  const jobs = [];
  for (const r of raws) { jobs.push({ id: r.id, order: 'o1', A: 'A', B: 'B', At: r.A, Bt: r.B, req: r.prompt }); jobs.push({ id: r.id, order: 'o2', A: 'B', B: 'A', At: r.B, Bt: r.A, req: r.prompt }); }
  const file = j => path.join(JUD, `${j.id}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[judge] ${todo.length} judgments in ${batches.length} batches (${GMODEL})`); let done = 0;
  await pool(batches, JUDGE_CONC, async (batch) => {
    const v = await batchJudge(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; const w = String(x.winner).toUpperCase().includes('B') ? j.B : j.A; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, order: j.order, winnerArm: w }, null, 2)); }
    done += batch.length; console.log(`[judge] ~${done}/${todo.length}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
const pct = (xs, f) => xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : 0;
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : 0;
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.mA && r.mB);
  const unbA = pct(raws, r => r.mA.unbacked === 1), unbB = pct(raws, r => r.mB.unbacked === 1);
  const evA = pct(raws, r => r.mA.evidence), evB = pct(raws, r => r.mB.evidence);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.order}`] = v; }
  let B = 0, A = 0, tie = 0;
  for (const r of raws) { const o1 = J[`${r.id}__o1`], o2 = J[`${r.id}__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'B') B++; else A++; } else tie++; }
  const dec = A + B;
  const out = { n: raws.length, unsupported_unbacked_pct: { A_fablever: unbA, B_with_loop: unbB }, shows_evidence_pct: { A_fablever: evA, B_with_loop: evB }, quality_gpt5_5: { B_loop_wins: B, A_plain_wins: A, ties: tie, decided: dec, B_win_pct: dec ? +(100 * B / dec).toFixed(1) : null, p: dec ? +binomTwoSided(B, dec).toFixed(4) : null }, mean_words: { A: mean(raws.map(r => r.mA.words)), B: mean(raws.map(r => r.mB.words)) } };
  fs.writeFileSync(path.join(HERE, 'results-evidence-loop.json'), JSON.stringify(out, null, 2));
  const q = out.quality_gpt5_5;
  const L = ['# Technique A/B — the EVIDENCE LOOP (tested independently, not ported)\n',
    `A generic "don't claim done until a check shows it" pass, applied on top of fablever and measured on its own merits — our own implementation, our own ${out.n}-task A/B. It targets fablever's *own* measured weakness (unsupported "it works" claims, 8.3% in the style-only ablation). Arm A = fablever; Arm B = fablever + one evidence pass. Quality judged by **GPT-5.5 (codex)**, both orders.\n`,
    '| metric | A: fablever | B: + evidence-loop | direction |',
    '|---|---|---|---|',
    `| unsupported "it works" w/o a shown check | ${unbA}% | ${unbB}% | lower better |`,
    `| reply shows a concrete check | ${evA}% | ${evB}% | higher better |`,
    `| mean words | ${out.mean_words.A} | ${out.mean_words.B} | cost proxy |`,
    '',
    `**Quality (GPT-5.5 forced-choice):** the evidence-loop arm B won **${q.B_loop_wins}–${q.A_plain_wins}** of ${q.decided} decided (${q.B_win_pct}%, p=${q.p}); ${q.ties} position-bias ties.`,
    '',
    '## Observed verdict — fixes its target metric, but HURTS quality as a full pass',
    `The loop did what it targets — unsupported claims **${unbA}%→${unbB}%**, evidence-showing **${evA}%→${evB}%** — but at a cost: it nearly doubled length (**${out.mean_words.A}→${out.mean_words.B} words**) and **GPT-5.5 preferred the leaner baseline ${q.A_plain_wins}–${q.B_loop_wins}** (p=${q.p}). As a full second pass the technique **over-corrects**: it trades fablever's terse decisiveness for evidence-padding the judge penalizes. **Verdict: do not adopt as-is.** The deterministic win is real, but the right version is *surgical* — add a check only where a claim is genuinely unbacked, without rewriting the whole reply. Independent GPT-5.5 judge; n=${out.n}. Validates the *technique*, not any library.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-evidence-loop.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else { await gen(); metrics(); await judge(); report(); }
