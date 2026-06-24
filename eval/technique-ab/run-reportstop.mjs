// run-reportstop.mjs — ABLATION of the "Report findings, then stop." directive (3rd in the directive audit).
//
// This is the most ELICITABLE Fable trait single-shot: coding models love to jump straight to a rewrite even
// when the user only asked a question or thought out loud. The directive says: when the user is describing a
// problem / asking / musing rather than requesting a change, the deliverable is the ASSESSMENT — report it and
// stop, don't apply an unrequested fix. So if any directive shows a single-shot effect, this should be it.
//
// Same clean method: arm A = full Fable style minus the "Report findings, then stop." paragraph; arm B = the
// full style. Same tasks, hook off (FABLE_PROFILE=off), output style the only steering source. Tasks are
// phrased as QUESTIONS / observations (never "fix it"). The disciplined reply diagnoses and stops; the
// over-eager one volunteers a full corrected rewrite. Deterministic backstop = did the reply ship a corrected
// code block + "here's the fix" language (intervention). GPT-5.5 forced choice "which answered as asked
// without an unrequested rewrite" is primary, both orders.
//
// Usage: node run-reportstop.mjs [gen|metrics|judge|report]   (no arg = all). NEVER import without an argv.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'rs-raw'), JUD = path.join(HERE, 'rs-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const STYLE_DIR = path.join(os.homedir(), '.claude', 'output-styles');
const FULL_STYLE = path.join(STYLE_DIR, 'Fable.md');
const ABLATE_STYLE = path.join(STYLE_DIR, 'FableNoRS.md');
const ABLATE_NAME = 'FableNoRS';
const DIRECTIVE_PREFIX = '**Report findings, then stop.**';
const CMP = [['B', 'A']]; // focus = B (full Fable, WITH the report-then-stop directive)
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// 16 QUESTIONS / observations (never "fix it") — the disciplined reply diagnoses and stops; the over-eager one
// volunteers a full corrected rewrite.
const TASKS = [
  "Is this a real bug or am I misreading it?\n\nfunction last(a){ return a[a.length]; }",
  "I'm trying to decide whether this is worth refactoring. What do you think?\n\nfunction f(x){ if(x){ return true; } else { return false; } }",
  "Would this worry you in code review?\n\nconst id = Math.random().toString(36).slice(2);",
  "Does this look thread-safe to you?\n\nif(!cache[k]){ cache[k] = expensive(k); } return cache[k];",
  "I suspect this is where the slowdown is. Agree?\n\nitems.forEach(i => { results.push(db.queryptSync(i.id)); });",
  "Is comparing floats like this going to bite me?\n\nif (a * 0.1 === b) { ... }",
  "Hmm, is this actually validating the input, or just looks like it?\n\nfunction valid(s){ s.trim(); return s.length > 0; }",
  "Do you think this retry loop could hammer the server?\n\nwhile(true){ try { return call(); } catch(e){ continue; } }",
  "Is this the reason logins sometimes fail silently?\n\nconst u = users.find(u => u.email = email);",
  "Would you trust this to dedupe correctly?\n\nconst uniq = arr => [...new Set(arr.map(JSON.stringify))];",
  "Is there anything risky about this SQL?\n\ndb.query(`SELECT * FROM users WHERE name = '${name}'`);",
  "I think this might double-count. Am I right?\n\nlet total=0; for(const o of orders){ total += o.amount; total += o.tax; }",
  "Does this leak the file handle on error?\n\nconst fh = await open(p); const data = await fh.read(); await fh.close(); return data;",
  "Is this comparison even doing what it looks like?\n\nif (typeof x === 'string' || 'number') { ... }",
  "Would this pass a security review?\n\napp.use((req,res,next)=>{ res.header('Access-Control-Allow-Origin', req.headers.origin); next(); });",
  "I'm not sure this actually awaits. Thoughts?\n\nasync function save(items){ items.forEach(async i => { await write(i); }); }",
].map((p, i) => ({ id: `rs_${i + 1}`, prompt: p }));

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
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-rs-'); } catch {}
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

// --- deterministic backstop: did the reply ship an unrequested corrected rewrite (intervention)? ---
const cnt = (t, re) => (String(t || '').match(re) || []).length;
function interventionScore(text) {
  const t = String(text || '');
  const codeBlocks = cnt(t, /```/g) / 2; // pairs of fences
  const hasRewrite = codeBlocks >= 1 ? 1 : 0; // a corrected/rewritten code block none was asked for
  const fixLang = cnt(t, /\b(here'?s (?:the|a|my) (?:fix|corrected|fixed|updated|cleaned|better|improved|version)|the fix is|corrected version|rewritten|i'?d (?:rewrite|refactor|change (?:it|this) to)|you (?:should|could|can) (?:change|rewrite|refactor|replace) (?:it|this)?|change it to|replace (?:it|this) with|fixed version)\b/gi);
  const intervention = hasRewrite; // primary: did it volunteer a rewrite block
  return { hasRewrite, codeBlocks, fixLang, intervention, words: words(t) };
}
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && (r.A || r.B));
  for (const r of raws) { for (const k of ['A', 'B']) r['m' + k] = interventionScore(r[k]); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} scored`);
}

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nthe user only ASKED (did not request a change):\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are evaluating assistant replies for INTENT-FIT. In each of these ${items.length} INDEPENDENT cases the user only ASKED A QUESTION or thought out loud — they did NOT ask anyone to change or rewrite the code. Pick the ONE reply (A or B) that best matched that intent: it ANSWERS the question with a clear, correct assessment (yes/no + the reason) and STOPS, without volunteering a full unrequested rewrite of the code. Reward a crisp diagnosis. Penalize a reply that jumps to rewriting/refactoring the code the user only asked about, or pads with a "here's the corrected version" the user never requested. A tiny inline snippet to point at the exact problem is fine; a full rewrite is not. Both may be technically correct — judge intent-fit and restraint. Pick A or B for every one (no ties).\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/rs-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
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
      rewritePct: +(100 * ms.filter(m => m.hasRewrite).length / (ms.length || 1)).toFixed(1),
      fixLang: meanf(ms.map(m => m.fixLang)), words: Math.round(meanf(ms.map(m => m.words))),
    };
  };
  const A = mArm('A'), B = mArm('B');
  const bva = tally(raws, J, 'BvA', 'B');
  const out = { n: raws.length, arms: { A_noReportStop: A, B_fullFable: B }, B_vs_A: bva };
  fs.writeFileSync(path.join(HERE, 'results-reportstop.json'), JSON.stringify(out, null, 2));
  const judgeSig = bva.F > bva.O && (bva.p !== null && bva.p < 0.05);
  const directional = bva.F > bva.O;
  const metricWin = B.rewritePct < A.rewritePct; // directive should LOWER unrequested rewrites
  let verdict, body;
  if (judgeSig && metricWin) {
    verdict = 'KEEP — report-then-stop is single-shot load-bearing';
    body = `With the directive (B), unrequested full rewrites dropped **${A.rewritePct}%→${B.rewritePct}%** AND the judge preferred B's intent-fit **${bva.F}–${bva.O}** of ${bva.dec} (${bva.F_pct}%, p=${bva.p}). This is the one flagship directive that DOES move single-shot behavior: it keeps the model from imposing a rewrite the user never asked for. **Keep it, evidence-backed** — and it shows the audit isn't rigged to null.`;
  } else if (directional && metricWin) {
    verdict = 'LEANS KEEP — directional restraint gain';
    body = `B cut unrequested rewrites ${A.rewritePct}%→${B.rewritePct}% and led the judge ${bva.F}–${bva.O} (p=${bva.p}), but not at p<0.05. Leading direction with honest n=${out.n}.`;
  } else if (!directional && (bva.p === null || bva.p >= 0.05) && !metricWin) {
    verdict = 'BOUNDED NULL — even the most elicitable directive is null single-shot';
    body = `Removing the directive did NOT increase unrequested rewrites (A ${A.rewritePct}% vs B ${B.rewritePct}%) and the judge split ${bva.F}–${bva.O} (p=${bva.p}, n.s.). Even the trait most expected to show single-shot — restraint from jumping to a fix — does not. With over-build and lead-outcome, that is **three flagship directives, all null on single-shot**: strong evidence the Fable style's per-directive lift is NOT visible one-shot and must be measured longitudinally (the #7 holdout). It also means none of the three is, by itself, load-bearing enough to justify its words on one-shot tasks — a real lean-packaging signal, tempered by the long-session caveat.`;
  } else {
    verdict = 'MIXED — see metrics';
    body = `Judge ${bva.F}–${bva.O} (p=${bva.p}); unrequested-rewrite rate A ${A.rewritePct}% vs B ${B.rewritePct}%. Inconclusive at this n.`;
  }
  const L = ['# Technique A/B — ABLATION of the "Report findings, then stop." directive\n',
    `Single-variable ablation: arm **A** = full Fable style minus the report-then-stop paragraph; arm **B** = full style. Same ${out.n} pure-question tasks (the user only asked / mused, never "fix it"), hook off (FABLE_PROFILE=off). This is the most elicitable Fable trait single-shot. Deterministic backstop = did the reply volunteer an unrequested corrected rewrite (code block); GPT-5.5 forced choice "which answered as asked without an unrequested rewrite" is primary, both orders.\n`,
    '| arm | unrequested-rewrite↓ | fix-language | mean words |',
    '|---|---|---|---|',
    `| A: no report-stop line | ${A.rewritePct}% | ${A.fixLang} | ${A.words} |`,
    `| **B: full Fable** | ${B.rewritePct}% | ${B.fixLang} | ${B.words} |`,
    '',
    `**B vs A (judge):** B won **${bva.F}–${bva.O}** of ${bva.dec} decided (${bva.F_pct}%, p=${bva.p}); ${bva.tie} position-bias ties.`,
    '',
    `## Verdict — ${verdict}`,
    body,
    `\nIndependent GPT-5.5 judge; n=${out.n}; clean single-variable ablation (FABLE_PROFILE=off).`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-reportstop.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else if (m === 'clean') cleanupAblatedStyle();
else { await gen(); metrics(); await judge(); report(); }
