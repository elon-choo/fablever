// run-leadoutcome.mjs — ABLATION of the "Lead with the outcome." directive (companion to run-overbuild.mjs).
//
// Same clean single-variable method as the over-build ablation: arm A is the full Fable output style with the
// "Lead with the outcome." paragraph REMOVED; arm B is the full style. Same tasks, hook disabled
// (FABLE_PROFILE=off) so the style is the only steering source. This directive is the MOST cleanly measurable
// single-shot Fable trait: on an analysis question with a clear bottom line, does the reply put the answer in
// its FIRST sentence, or bury it after a code walkthrough? If B (with the directive) leads with the outcome
// more and the judge prefers it → load-bearing, KEEP (evidence-backed). If no difference → the base model
// already answers first, another lean-packaging candidate, reinforcing that the style's value is longitudinal.
//
// Tasks are analysis QUESTIONS (not "fix it") that have a crisp verdict — the natural place to either lead
// with the conclusion or walk up to it. Deterministic backstop: does sentence 1 carry the verdict, or open
// with a walkthrough preamble ("Looking at…", "Let's…", "This function…"). GPT-5.5 forced choice is primary.
//
// Usage: node run-leadoutcome.mjs [gen|metrics|judge|report]   (no arg = all). NEVER import this without an
// argv — the no-arg path runs the full (generating) pipeline.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'lo-raw'), JUD = path.join(HERE, 'lo-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const STYLE_DIR = path.join(os.homedir(), '.claude', 'output-styles');
const FULL_STYLE = path.join(STYLE_DIR, 'Fable.md');
const ABLATE_STYLE = path.join(STYLE_DIR, 'FableNoLO.md');
const ABLATE_NAME = 'FableNoLO';
const DIRECTIVE_PREFIX = '**Lead with the outcome.**';
const CMP = [['B', 'A']]; // focus = B (full Fable, WITH the lead-with-outcome directive)
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// 16 analysis QUESTIONS with a crisp bottom line — the natural place to lead with the answer or bury it.
const TASKS = [
  "Why might this sometimes return undefined?\n\nfunction first(a){ for(const x of a){ if(x>0) return x; } }",
  "Is this safe to run in production? What's the risk?\n\napp.get('/run', (req,res)=>{ eval(req.query.cmd); res.end(); });",
  "Does this correctly compute the average? What happens on an empty array?\n\nconst avg = a => a.reduce((x,y)=>x+y) / a.length;",
  "Is this O(n) or O(n^2)?\n\nfunction dupes(a){ return a.filter((x,i)=>a.indexOf(x)!==i); }",
  "Why are my dates off by one day?\n\nconst d = new Date(dateStr).toISOString().slice(0,10);",
  "Is there a race condition here?\n\nlet n=0; async function inc(){ const v=await read(); await write(v+1); n=v+1; }",
  "Will this leak memory? Why?\n\nfunction attach(els){ els.forEach(el=>el.addEventListener('click', ()=>bigCache.push(el))); }",
  "Does this regex actually validate emails well? What does it miss?\n\nconst ok = /.+@.+/.test(email);",
  "Is this == a problem here?\n\nif (userInput == 0) { resetAll(); }",
  "Why might this lock never get released?\n\nawait lock.acquire(); doWork(); lock.release();",
  "Is storing the JWT in localStorage a security problem here? Why?\n\nlocalStorage.setItem('jwt', token);",
  "Does this debounce keep the latest arguments?\n\nfunction debounce(fn,ms){ let t; return ()=>{ clearTimeout(t); t=setTimeout(fn,ms); }; }",
  "What's wrong with the error handling here?\n\ntry { risky(); } catch(e) {}",
  "Is this pagination correct for 1-based pages?\n\nfunction page(a,p,n){ return a.slice(p*n, p*n+n); }",
  "Why does this sometimes double-charge?\n\nasync function pay(id){ if(!charged.has(id)){ await charge(id); charged.add(id); } }",
  "Is this CORS setup too open? What could go wrong?\n\nres.setHeader('Access-Control-Allow-Origin','*');\nres.setHeader('Access-Control-Allow-Credentials','true');",
].map((p, i) => ({ id: `lo_${i + 1}`, prompt: p }));

function ensureAblatedStyle() {
  const full = fs.readFileSync(FULL_STYLE, 'utf8');
  const lines = full.split('\n');
  const kept = []; let removed = 0, renamed = false;
  for (const ln of lines) {
    if (ln.startsWith(DIRECTIVE_PREFIX)) { removed++; continue; }
    if (ln.startsWith('name:') && !renamed) { kept.push('name: ' + ABLATE_NAME); renamed = true; continue; }
    kept.push(ln);
  }
  if (removed !== 1) throw new Error(`expected to remove exactly 1 "${DIRECTIVE_PREFIX}" line, removed ${removed} — Fable.md changed shape`);
  const text = kept.join('\n').replace(/\n\n\n+/g, '\n\n');
  fs.writeFileSync(ABLATE_STYLE, text);
  return { removed, bytesFull: full.length, bytesAblate: text.length };
}
function cleanupAblatedStyle() { try { fs.unlinkSync(ABLATE_STYLE); } catch {} }

function runClaude(prompt, style) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-lo-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', JSON.stringify({ outputStyle: style })], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: 'off' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genC(prompt, style) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt, style); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }
async function gen() {
  const info = ensureAblatedStyle();
  console.log(`[gen] built ${ABLATE_NAME} style (removed ${info.removed} line; ${info.bytesFull}→${info.bytesAblate} bytes). A=${ABLATE_NAME}, B=Fable, FABLE_PROFILE=off`);
  try {
    const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
    console.log(`[gen] ${todo.length} tasks`); let done = 0;
    await pool(todo, GEN_CONC, async (t) => {
      const A = await genC(t.prompt, ABLATE_NAME);
      const B = await genC(t.prompt, 'Fable');
      fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, prompt: t.prompt, A, B }, null, 2));
      done++; console.log(`[gen] ${done}/${todo.length} ${t.id} A=${A.length} B=${B.length}`);
    });
  } finally { cleanupAblatedStyle(); console.log(`[gen] removed temp ${ABLATE_NAME} style`); }
}

// --- deterministic backstop: is the verdict in the first sentence, or does it open with a walkthrough? ---
const firstSentence = t => { const s = String(t || '').replace(/```[\s\S]*?```/g, ' ').trim(); const m = s.match(/^.*?[.!?\n](?=\s|$)/); return (m ? m[0] : s).slice(0, 240); };
const WALKTHROUGH_OPEN = /^\s*(let'?s|looking at|let me|i'?ll|walking through|stepping through|going through|reading through|to (?:answer|figure|understand)|first[,;]|breaking (?:this|it) down|here'?s what (?:this|the)|this (?:function|code|snippet|method)\b|the (?:function|code|snippet) (?:above |below )?(?:takes|does|loops|iterates))/i;
const VERDICT_OPEN = /\b(yes|no|nope|undefined|null|nan|the (?:bug|issue|problem|reason|risk|answer|cause)|it (?:returns|fails|breaks|crashes|leaks|works|is|never|double|can|will|won'?t|doesn'?t)|because|short answer|bottom line|tl;?dr|o\(n|race condition|memory leak|not safe|unsafe|too (?:open|permissive)|off by one|missing|wrong)\b/i;
function leadScore(text) {
  const fs1 = firstSentence(text);
  const opensWalkthrough = WALKTHROUGH_OPEN.test(fs1) ? 1 : 0;
  const leadsVerdict = (!opensWalkthrough && VERDICT_OPEN.test(fs1)) ? 1 : 0;
  return { leadsVerdict, opensWalkthrough, firstSent: fs1, words: words(text) };
}
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && (r.A || r.B));
  for (const r of raws) { for (const k of ['A', 'B']) r['m' + k] = leadScore(r[k]); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} scored`);
}

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nQUESTION:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a busy senior engineer who asked a colleague each QUESTION below and wants the bottom-line answer fast. For EACH of these ${items.length} INDEPENDENT cases, two replies (A and B) answer the SAME question. Pick the ONE that LEADS WITH THE OUTCOME — its first sentence states the answer/verdict (e.g. "Yes, it returns undefined when the array has no positive element" or "Not safe — it evals user input"), with the explanation AFTER. Penalize a reply that buries the answer under a code walkthrough or preamble before getting to the point. Both may be technically correct; reward the one that puts the conclusion first and is tightest. Pick A or B for every one (no ties).\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/lo-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
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
const meanf = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0;
function tally(raws, J, cmp, focus) {
  let F = 0, O = 0, tie = 0;
  for (const r of raws) { const o1 = J[`${r.id}__${cmp}__o1`], o2 = J[`${r.id}__${cmp}__o2`]; if (!o1 || !o2) continue; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === focus) F++; else O++; } else tie++; }
  const dec = F + O; return { F, O, tie, dec, F_pct: dec ? +(100 * F / dec).toFixed(1) : null, p: dec ? +binomTwoSided(F, dec).toFixed(4) : null };
}
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.mA && r.mB);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.cmp}__${v.order}`] = v; }
  const mArm = arm => {
    const ms = raws.map(r => r['m' + arm]).filter(Boolean);
    return {
      leadsVerdictPct: +(100 * ms.filter(m => m.leadsVerdict).length / (ms.length || 1)).toFixed(1),
      walkthroughPct: +(100 * ms.filter(m => m.opensWalkthrough).length / (ms.length || 1)).toFixed(1),
      words: Math.round(meanf(ms.map(m => m.words))),
    };
  };
  const A = mArm('A'), B = mArm('B');
  const bva = tally(raws, J, 'BvA', 'B');
  const out = { n: raws.length, arms: { A_noLeadOutcome: A, B_fullFable: B }, B_vs_A: bva };
  fs.writeFileSync(path.join(HERE, 'results-leadoutcome.json'), JSON.stringify(out, null, 2));
  const judgeSig = bva.F > bva.O && (bva.p !== null && bva.p < 0.05);
  const directional = bva.F > bva.O;
  const metricWin = B.leadsVerdictPct > A.leadsVerdictPct || B.walkthroughPct < A.walkthroughPct;
  let verdict, body;
  if (judgeSig && metricWin) {
    verdict = 'KEEP — the lead-with-outcome directive earns its words';
    body = `With the directive (B), the judge preferred the reply **${bva.F}–${bva.O}** of ${bva.dec} (${bva.F_pct}%, p=${bva.p}) AND B led with the verdict more (${A.leadsVerdictPct}%→${B.leadsVerdictPct}% first-sentence verdict, walkthrough-openers ${A.walkthroughPct}%→${B.walkthroughPct}%). The line measurably moves answer-first structure; **keep it, evidence-backed.**`;
  } else if (directional && metricWin) {
    verdict = 'LEANS KEEP — directional answer-first gain';
    body = `B led the judge ${bva.F}–${bva.O} (p=${bva.p}) and led with the verdict more often (${A.leadsVerdictPct}%→${B.leadsVerdictPct}%), but not at p<0.05. Leading direction with honest n=${out.n}.`;
  } else if (!directional && (bva.p === null || bva.p >= 0.05) && !metricWin) {
    verdict = 'BOUNDED NULL — base model already answers first';
    body = `Removing the directive did NOT reduce answer-first structure (verdict-first A ${A.leadsVerdictPct}% vs B ${B.leadsVerdictPct}%; walkthrough-openers A ${A.walkthroughPct}% vs B ${B.walkthroughPct}%) and the judge split ${bva.F}–${bva.O} (p=${bva.p}, n.s.). On single-shot analysis questions Opus already leads with the bottom line, so this directive is **redundant here** — another lean-packaging candidate whose value, if any, is longitudinal. Consistent with the over-build ablation: single-shot can't see the style's per-directive lift.`;
  } else {
    verdict = 'MIXED — see metrics';
    body = `Judge ${bva.F}–${bva.O} (p=${bva.p}); verdict-first A ${A.leadsVerdictPct}% vs B ${B.leadsVerdictPct}%; walkthrough A ${A.walkthroughPct}% vs B ${B.walkthroughPct}%. Inconclusive at this n.`;
  }
  const L = ['# Technique A/B — ABLATION of the "Lead with the outcome." directive\n',
    `Single-variable ablation: arm **A** = full Fable style minus the lead-with-outcome paragraph; arm **B** = full style. Same ${out.n} analysis questions with a crisp bottom line, hook off (FABLE_PROFILE=off). Deterministic backstop = is the verdict in sentence 1 vs a walkthrough opener; GPT-5.5 forced choice "which leads with the outcome" is primary, both orders.\n`,
    '| arm | verdict-in-sentence-1↑ | walkthrough-opener↓ | mean words |',
    '|---|---|---|---|',
    `| A: no lead-outcome line | ${A.leadsVerdictPct}% | ${A.walkthroughPct}% | ${A.words} |`,
    `| **B: full Fable** | ${B.leadsVerdictPct}% | ${B.walkthroughPct}% | ${B.words} |`,
    '',
    `**B vs A (judge):** B won **${bva.F}–${bva.O}** of ${bva.dec} decided (${bva.F_pct}%, p=${bva.p}); ${bva.tie} position-bias ties.`,
    '',
    `## Verdict — ${verdict}`,
    body,
    `\nIndependent GPT-5.5 judge; n=${out.n}; clean single-variable ablation (FABLE_PROFILE=off).`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-leadoutcome.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else if (m === 'clean') cleanupAblatedStyle();
else { await gen(); metrics(); await judge(); report(); }
