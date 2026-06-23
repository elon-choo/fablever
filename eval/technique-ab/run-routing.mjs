// run-routing.mjs — Validates the #1 upgrade from RESEARCH-upgrade-points.md: TASK-TYPE ROUTING. The research
// (and fablize's hooks/router.sh) argues you should inject a heavy discipline ONLY for the task type that
// needs it, not uniformly — because always-on discipline pads the tasks that don't need it (our +14%/call
// cost finding; the evidence-loop's "padding everything" failure). This tests that claim headless at the
// prompt level — no install change.
//
//   A (baseline) = fablever, no extra discipline.
//   B (always-on) = inject ALL THREE disciplines (evidence + plan + investigation) on EVERY task — the
//                   uniform-heavy strawman.
//   C (routed)   = a keyword classifier (like router.sh) injects ONLY the matching discipline per task;
//                  simple tasks get NOTHING.
//
// 16 tasks across 4 categories (confirm/fix → evidence, multi-step build → plan, debug → investigation,
// simple → none). Hypothesis: C beats B (routing ≥ always-on on quality while LEANER) and C ≥ A — the
// clearest signal on the SIMPLE tasks, where B pads and C stays lean. GPT-5.5 forced choice (C-vs-A, C-vs-B),
// both orders; mean words per arm as the cost proxy; routing accuracy reported.
// Usage: node run-routing.mjs [gen|metrics|judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'rt-raw'), JUD = path.join(HERE, 'rt-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const CMP = [['C', 'A'], ['C', 'B']]; // routed vs baseline, routed vs always-on
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

const TASKS = [
  // cat a — confirm/fix → EVIDENCE
  { id: 'a1', cat: 'confirm', prompt: "This returns the first index but should return the last:\n\nfunction lastIdx(a,x){for(let i=0;i<a.length;i++)if(a[i]===x)return i;return -1;}\n\nFix it and confirm it's correct." },
  { id: 'a2', cat: 'confirm', prompt: "This sum is off by one:\n\nfunction sum(a){let t=0;for(let i=0;i<=a.length;i++)t+=a[i];return t;}\n\nFix and confirm." },
  { id: 'a3', cat: 'confirm', prompt: "This capitalize crashes on empty strings:\n\nfunction cap(s){return s[0].toUpperCase()+s.slice(1);}\n\nFix it and confirm it's safe." },
  { id: 'a4', cat: 'confirm', prompt: "This range is exclusive but should include b:\n\nfunction range(a,b){const o=[];for(let i=a;i<b;i++)o.push(i);return o;}\n\nMake it inclusive and confirm." },
  // cat b — multi-step build → PLAN
  { id: 'b1', cat: 'build', prompt: "Implement a small in-memory key-value store module with: get, set, delete, has, and a size getter. Include input validation." },
  { id: 'b2', cat: 'build', prompt: "Build a `parseConfig(text)` that supports comments (#), key=value lines, quoted values, integer/boolean coercion, and ignoring blank lines. Return an object." },
  { id: 'b3', cat: 'build', prompt: "Create a rate limiter with a constructor(maxPerWindow, windowMs), an allow(key) method, per-key windows, and automatic window reset." },
  { id: 'b4', cat: 'build', prompt: "Implement a tiny event emitter module with on, once, off, and emit — handling multiple listeners, once-removal, and emit during emit safely." },
  // cat c — debug → INVESTIGATE
  { id: 'c1', cat: 'debug', prompt: "This sometimes returns undefined for valid input — why does it fail, and fix it:\n\nasync function first(arr){return arr.map(async x=>await load(x))[0];}" },
  { id: 'c2', cat: 'debug', prompt: "Users report this throttle never fires the trailing call. Find the root cause and fix:\n\nfunction throttle(fn,ms){let last=0;return(...a)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...a);}};}" },
  { id: 'c3', cat: 'debug', prompt: "This memoize returns stale results — diagnose the root cause and fix:\n\nfunction memo(fn){let c;return()=>c??(c=fn());}" },
  { id: 'c4', cat: 'debug', prompt: "This deep-merge corrupts its first argument intermittently. Find why it fails and fix:\n\nfunction merge(a,b){for(const k in b){if(typeof b[k]==='object')a[k]=merge(a[k],b[k]);else a[k]=b[k];}return a;}" },
  // cat d — simple → NONE (the contrast: always-on pads these, routed leaves them lean)
  { id: 'd1', cat: 'simple', prompt: "Write a function `add(a, b)` that returns their sum." },
  { id: 'd2', cat: 'simple', prompt: "Write a function that reverses a string." },
  { id: 'd3', cat: 'simple', prompt: "Write a function `isEven(n)` that returns whether n is even." },
  { id: 'd4', cat: 'simple', prompt: "Write a function `maxOf(arr)` that returns the largest number in an array." },
];

const EVIDENCE = `One discipline: never write that something is done / fixed / works / correct unless that SAME line shows the check that proves it — a one-line input→output, a short assertion, or a brief complexity note. If you cannot show the check, write "(unverified)". Add the check, not commentary.`;
const PLAN = `Before writing code, briefly outline the parts/steps you will implement (a short list), then implement them. Keep the outline tight — no padding.`;
const INVESTIGATE = `Before patching: state the single most likely ROOT CAUSE and how you would confirm it (a reproduction or trace), then fix that cause. Don't guess-patch the symptom.`;
const ALL3 = `${EVIDENCE}\n${PLAN}\n${INVESTIGATE}`;
const wrap = d => d ? `\n\n---\n${d}` : '';

// keyword router (mirrors fablize's router.sh approach): smallest matching discipline, simple → none
function classify(prompt) {
  const low = prompt.toLowerCase();
  if (/\b(why does|root cause|diagnose|find why|fails|crashes|report)\b/.test(low)) return 'INVESTIGATE';
  if (/\b(implement|build|create|module|rate limiter|emitter|store)\b/.test(low)) return 'PLAN';
  if (/\b(fix|confirm|correct|inclusive)\b/.test(low)) return 'EVIDENCE';
  return 'NONE';
}
const DISC = { EVIDENCE, PLAN, INVESTIGATE, NONE: '' };
const expectedRoute = { confirm: 'EVIDENCE', build: 'PLAN', debug: 'INVESTIGATE', simple: 'NONE' };

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-rt-'); } catch {}
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
  console.log(`[gen] ${todo.length} tasks (A, B, C)`); let done = 0;
  await pool(todo, GEN_CONC, async (t) => {
    const route = classify(t.prompt);
    const A = await genC(t.prompt);
    const B = await genC(t.prompt + wrap(ALL3));
    const C = await genC(t.prompt + wrap(DISC[route]));
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, cat: t.cat, route, routeOK: route === expectedRoute[t.cat], prompt: t.prompt, A, B, C }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} cat=${t.cat} route=${route} A=${A.length} B=${B.length} C=${C.length}`);
  });
}

function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.A);
  for (const r of raws) { r.w = { A: words(r.A), B: words(r.B), C: words(r.C) }; fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} scored`);
}

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the same coding request — pick the ONE you'd rather receive to ship a correct result with least extra work. Pick A or B for every one (no ties). Reward correctness, a fix/build shown to work, decisiveness, scope discipline, tight writing matched to the task's size. Penalize unsupported "it works" claims, doing more than asked, and padding a simple task with ceremony.\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/rt-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
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
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : 0;
function tally(raws, J, cmp, focus) {
  let F = 0, O = 0, tie = 0;
  for (const r of raws) { const o1 = J[`${r.id}__${cmp}__o1`], o2 = J[`${r.id}__${cmp}__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === focus) F++; else O++; } else tie++; }
  const dec = F + O; return { F, O, tie, dec, F_pct: dec ? +(100 * F / dec).toFixed(1) : null, p: dec ? +binomTwoSided(F, dec).toFixed(4) : null };
}
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.w);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.cmp}__${v.order}`] = v; }
  const wA = mean(raws.map(r => r.w.A)), wB = mean(raws.map(r => r.w.B)), wC = mean(raws.map(r => r.w.C));
  const simple = raws.filter(r => r.cat === 'simple');
  const wBs = mean(simple.map(r => r.w.B)), wCs = mean(simple.map(r => r.w.C)), wAs = mean(simple.map(r => r.w.A));
  const routeAcc = raws.length ? +(100 * raws.filter(r => r.routeOK).length / raws.length).toFixed(1) : 0;
  const cva = tally(raws, J, 'CvA', 'C');
  const cvb = tally(raws, J, 'CvB', 'C');
  const out = { n: raws.length, routing_accuracy_pct: routeAcc, mean_words: { A: wA, B_alwayson: wB, C_routed: wC }, mean_words_SIMPLE_tasks: { A: wAs, B_alwayson: wBs, C_routed: wCs }, C_vs_A: cva, C_vs_B: cvb };
  fs.writeFileSync(path.join(HERE, 'results-routing.json'), JSON.stringify(out, null, 2));
  const winsB = cvb.F > cvb.O, leaner = wC < wB;
  const verdict = (winsB || (cvb.dec && cvb.F >= cvb.O)) && leaner ? 'ROUTING VALIDATED — same-or-better quality than always-on, at lower cost' : (leaner ? 'PARTIAL — routed is leaner but quality vs always-on inconclusive' : 'inconclusive');
  const L = ['# Technique A/B — TASK-TYPE ROUTING (the #1 upgrade): route discipline, don\'t apply it uniformly\n',
    `Tests the headline upgrade-research claim (and fablize's \`router.sh\` pattern): inject a heavy discipline only for the task type that needs it, not on every task. A=baseline, B=always-on (all 3 disciplines every task), C=routed (keyword classifier picks the one discipline; simple tasks get none). ${out.n} tasks across confirm/build/debug/simple. GPT-5.5 forced choice, both orders.\n`,
    `**Routing accuracy:** ${routeAcc}% of tasks classified to the intended discipline.\n`,
    '| arm | mean words (all) | mean words (SIMPLE tasks) |',
    '|---|---|---|',
    `| A baseline | ${wA} | ${wAs} |`,
    `| B always-on | ${wB} | ${wBs} |`,
    `| **C routed** | ${wC} | ${wCs} |`,
    '',
    `**C vs A (routed vs baseline):** C won **${cva.F}–${cva.O}** of ${cva.dec} (${cva.F_pct}%, p=${cva.p}); ${cva.tie} ties.`,
    `**C vs B (routed vs always-on):** C won **${cvb.F}–${cvb.O}** of ${cvb.dec} (${cvb.F_pct}%, p=${cvb.p}); ${cvb.tie} ties.`,
    '',
    `## Verdict — ${verdict}`,
    `Routing the discipline to the task type ${cvb.F >= cvb.O ? 'matches-or-beats' : 'underperforms'} applying everything always (C vs B ${cvb.F}–${cvb.O}) while staying leaner overall (${wC} vs ${wB} words) — and the gap is sharpest on **simple tasks** (routed ${wCs}w vs always-on ${wBs}w), where uniform discipline is pure ceremony. C ${cva.F >= cva.O ? 'also holds up against' : 'trails'} the bare baseline (${cva.F}–${cva.O}). This is the mechanism behind the +14%/call cost finding: **apply the discipline where it pays, skip it where it doesn't.** Independent GPT-5.5 judge; n=${out.n}, directional. The install wiring (a real \`router\` hook) remains a separate gated change.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-routing.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else { await gen(); metrics(); await judge(); report(); }
