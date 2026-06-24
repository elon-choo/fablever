// run-overbuild.mjs — ABLATION of the flagship "Don't over-build." directive.
//
// Every other A/B in this folder tests an ADDED technique on top of the Fable baseline. This one asks the
// opposite, leaner question the operator cares about: is a directive ALREADY shipped in the profile pulling
// its weight, or is it inert (cut it → leaner packaging) or harmful? "Don't over-build." is a marquee Fable
// trait with no dedicated experiment yet, and it has an unusually objective signal — you can literally COUNT
// the added scope (unrequested try/catch, validation, tests, helpers, docs, "I also added…" phrases).
//
// Clean single-variable ablation (NOT additive):
//   A = the full Fable output style with the "Don't over-build." paragraph REMOVED  (style: FableNoOB)
//   B = the full Fable output style, unchanged                                       (style: Fable)
// The ONLY difference between A and B is that one paragraph. Both run the SAME narrow, scope-creep-tempting
// request where the correct answer is tiny but the temptation to gold-plate is strong.
//
// CONTAMINATION CONTROL: the reinject UserPromptSubmit hook DOES fire in headless `claude -p` (verified), and
// its compact/core reminders BOTH contain "don't over-build" — so FABLE_PROFILE='' would inject the directive
// into BOTH arms and destroy the ablation. We therefore run with FABLE_PROFILE=off (hook exits immediately,
// verified delta=0 markers), leaving the output style as the ONLY steering source. Clean contrast.
//
// Read: deterministic creep score (lower = more disciplined) + GPT-5.5 forced choice "which did EXACTLY what
// was asked, nothing extra", both orders (order-inconsistent = position-bias tie). If B (with the directive)
// produces lower creep AND wins the judge → the directive earns its words, KEEP it. If no difference → it is
// redundant given the rest of the style, a candidate to CUT for leaner packaging. Either way: a real result.
//
// Usage: node run-overbuild.mjs [gen|metrics|judge|report]   (no arg = all)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'ob-raw'), JUD = path.join(HERE, 'ob-judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 5;
const STYLE_DIR = path.join(os.homedir(), '.claude', 'output-styles');
const FULL_STYLE = path.join(STYLE_DIR, 'Fable.md');
const ABLATE_STYLE = path.join(STYLE_DIR, 'FableNoOB.md');
const CMP = [['B', 'A']]; // focus = B (full Fable, WITH the over-build directive)
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// 16 narrow requests: the correct answer is TINY, the temptation to gold-plate is strong (add error handling,
// validation, helpers, tests, docs, config, refactors of surrounding code, "I also added…").
const TASKS = [
  "Add a function slugify(s) that lowercases the string and replaces spaces with hyphens. Just the function.",
  "Change the timeout from 30 to 60 seconds in this line:\n\nconst TIMEOUT_MS = 30000;",
  "Give me a one-liner that sums an array of numbers called nums.",
  "Rename the variable `data` to `users` in this snippet:\n\nconst data = await db.query('select * from users');\nreturn data.map(d => d.name);",
  "Add a --verbose flag to this CLI that, when present, prints the config object. Here's the arg handling:\n\nconst args = process.argv.slice(2);\nconst config = loadConfig();\nrun(config);",
  "Fix the off-by-one in this loop:\n\nfor (let i = 0; i <= arr.length; i++) { process(arr[i]); }",
  "Add a GET /health route to this Express app that returns 200 with the text OK:\n\nconst app = express();\napp.get('/', (req,res) => res.send('home'));",
  "Convert this to async/await:\n\nfunction load(cb){ fs.readFile('a.txt','utf8',(e,d)=>cb(e,d)); }",
  "Add a default value of 10 to the `limit` parameter:\n\nfunction fetchPage(offset, limit) { return rows.slice(offset, offset + limit); }",
  "Capitalize the first letter of `name` before saving:\n\nuser.name = name;\nawait user.save();",
  "Export the existing parseConfig function:\n\nfunction parseConfig(raw) { return JSON.parse(raw); }",
  "Add a console.log of the user id right after login:\n\nconst user = await login(email, password);\nreturn user;",
  "Change the button color from blue to green in this CSS:\n\n.btn { color: blue; padding: 8px; }",
  "Add 1 to every element of the array `nums` and return the new array.",
  "Make greet(name) return the string 'Hello, ' followed by name:\n\nfunction greet(name) {}",
  "Add a created_at timestamp column to this table definition:\n\nCREATE TABLE posts (\n  id SERIAL PRIMARY KEY,\n  title TEXT NOT NULL\n);",
].map((p, i) => ({ id: `ob_${i + 1}`, prompt: p }));

// --- build the ablated output style: full Fable minus exactly the over-build paragraph ---
function ensureAblatedStyle() {
  const full = fs.readFileSync(FULL_STYLE, 'utf8');
  const lines = full.split('\n');
  const kept = [];
  let removed = 0, renamed = false;
  for (const ln of lines) {
    if (ln.startsWith("**Don't over-build.**")) { removed++; continue; } // drop exactly this paragraph line
    if (ln.startsWith('name:') && !renamed) { kept.push('name: FableNoOB'); renamed = true; continue; }
    kept.push(ln);
  }
  if (removed !== 1) throw new Error(`expected to remove exactly 1 over-build line, removed ${removed} — Fable.md changed shape`);
  // collapse the blank line the removal may have doubled (cosmetic; does not affect the model)
  const text = kept.join('\n').replace(/\n\n\n+/g, '\n\n');
  fs.writeFileSync(ABLATE_STYLE, text);
  return { removed, bytesFull: full.length, bytesAblate: text.length };
}
function cleanupAblatedStyle() { try { fs.unlinkSync(ABLATE_STYLE); } catch {} }

function runClaude(prompt, style) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-ob-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      // FABLE_PROFILE=off → reinject hook exits immediately, so the output style is the ONLY steering source.
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
  console.log(`[gen] built FableNoOB style (removed ${info.removed} line; ${info.bytesFull}→${info.bytesAblate} bytes). A=FableNoOB, B=Fable, FABLE_PROFILE=off`);
  try {
    const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
    console.log(`[gen] ${todo.length} tasks`); let done = 0;
    await pool(todo, GEN_CONC, async (t) => {
      const A = await genC(t.prompt, 'FableNoOB');
      const B = await genC(t.prompt, 'Fable');
      fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, prompt: t.prompt, A, B }, null, 2));
      done++; console.log(`[gen] ${done}/${todo.length} ${t.id} A=${A.length} B=${B.length}`);
    });
  } finally { cleanupAblatedStyle(); console.log('[gen] removed temp FableNoOB style'); }
}

// --- deterministic over-build / scope-creep score (lower = more disciplined) ---
const cnt = (t, re) => (String(t || '').match(re) || []).length;
function creepScore(text) {
  const t = String(text || '');
  const code = (t.match(/```[\s\S]*?```/g) || []).join('\n'); // only count constructs inside code blocks
  const tryCatch = cnt(code, /\btry\s*\{/g);
  const throws = cnt(code, /\bthrow\b/g);
  const guards = cnt(code, /\b(typeof|Array\.isArray|instanceof|isNaN|Number\.is\w+)\b/g);
  const tests = cnt(code, /\b(test|describe|it)\s*\(|\bexpect\s*\(|\bassert\w*\s*\(/g);
  const jsdoc = cnt(code, /\/\*\*/g);
  const bonus = cnt(t, /\b(also added|i also|i'?ve also|additionally|as a bonus|for good measure|while we'?re at it|robustness|edge case|more robust|defensive|just in case|production-ready|you (?:may|might) (?:also )?want|feel free to)\b/gi);
  const fnDecls = cnt(code, /\bfunction\b|=>/g);
  const extraFns = Math.max(0, fnDecls - 1); // one function/arrow is usually the asked-for thing
  const codeLines = code ? code.split('\n').filter(l => l.trim() && !l.trim().startsWith('```')).length : 0;
  const composite = tryCatch + throws + guards + tests + jsdoc + bonus + extraFns;
  return { tryCatch, throws, guards, tests, jsdoc, bonus, extraFns, codeLines, words: words(t), composite };
}
function metrics() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && (r.A || r.B));
  for (const r of raws) { for (const k of ['A', 'B']) r['m' + k] = creepScore(r[k]); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2)); }
  console.log(`[metrics] ${raws.length} scored`);
}

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function batchPrompt(items) {
  const blocks = items.map((j, i) => `=== COMPARISON ${i + 1} ===\nREQUEST:\n${j.req}\n--- REPLY A ---\n${j.At || '(empty)'}\n--- REPLY B ---\n${j.Bt || '(empty)'}`).join('\n\n');
  return `You are a demanding senior engineer doing code review. Below are ${items.length} INDEPENDENT comparisons. For EACH, two replies (A and B) answer the SAME narrow request. Pick the ONE reply that did EXACTLY what was asked and nothing more. Both should be correct; if both are correct, prefer the one with LESS unrequested scope. PENALIZE a reply for any of: adding features not requested, adding error handling / validation / try-catch / null-checks for cases the request never mentioned, refactoring surrounding code, introducing helper functions or abstractions, adding tests, adding documentation or comments not asked for, adding configuration options, or commentary suggesting further work ("you may also want…", "I also added…"). REWARD the minimal, correct, in-place answer. Pick A or B for every one (no ties).\n\n${blocks}\n\nOutput ONLY one line of JSON with exactly ${items.length} verdicts: {"verdicts":[{"n":1,"winner":"A or B"}, ...]}`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/ob-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
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
      creep: meanf(ms.map(m => m.composite)), words: Math.round(meanf(ms.map(m => m.words))), codeLines: meanf(ms.map(m => m.codeLines)),
      tryCatch: meanf(ms.map(m => m.tryCatch)), throws: meanf(ms.map(m => m.throws)), guards: meanf(ms.map(m => m.guards)),
      tests: meanf(ms.map(m => m.tests)), jsdoc: meanf(ms.map(m => m.jsdoc)), bonus: meanf(ms.map(m => m.bonus)), extraFns: meanf(ms.map(m => m.extraFns)),
      cleanPct: +(100 * ms.filter(m => m.composite === 0).length / (ms.length || 1)).toFixed(1),
    };
  };
  const A = mArm('A'), B = mArm('B');
  const bva = tally(raws, J, 'BvA', 'B');
  const out = { n: raws.length, arms: { A_noOverbuild: A, B_fullFable: B }, B_vs_A: bva };
  fs.writeFileSync(path.join(HERE, 'results-overbuild.json'), JSON.stringify(out, null, 2));
  const creepDrop = +(A.creep - B.creep).toFixed(2);
  const judgeWin = bva.F > bva.O && (bva.p !== null && bva.p < 0.05);
  const directionalWin = bva.F > bva.O;
  const metricWin = B.creep < A.creep;
  let verdict, body;
  if (judgeWin && metricWin) {
    verdict = 'KEEP — the over-build directive earns its words';
    body = `With the directive (B), the judge preferred the reply **${bva.F}–${bva.O}** of ${bva.dec} decided (${bva.F_pct}%, p=${bva.p}) AND the deterministic creep score fell **${A.creep}→${B.creep}** (−${creepDrop}). The line causes measurably leaner, more in-scope answers; it is not redundant given the rest of the style. **Keep it, now evidence-backed.**`;
  } else if (metricWin && directionalWin) {
    verdict = 'LEANS KEEP — directional, directive reduces creep';
    body = `The directive (B) lowered the creep score **${A.creep}→${B.creep}** (−${creepDrop}) and led the judge ${bva.F}–${bva.O} (p=${bva.p}), but not yet at p<0.05. Report as the leading direction with honest n=${out.n}; a confirmation round would settle it.`;
  } else if (!metricWin && (bva.p === null || bva.p >= 0.05)) {
    verdict = 'BOUNDED NULL — redundant here, a lean-packaging candidate';
    body = `Removing the directive did NOT raise scope-creep (A ${A.creep} vs B ${B.creep}) and the judge split ${bva.F}–${bva.O} (p=${bva.p}, n.s.). On single-shot narrow tasks the rest of the Fable style ("act when you have enough", "no filler") already suppresses gold-plating, so this one line is **redundant for these tasks** — its real value, if any, is in long multi-step sessions a single-shot A/B can't see (the harness paradox). Honest call: not load-bearing here; safe to shorten if leaner packaging is the goal, but keep pending a long-session holdout read.`;
  } else {
    verdict = 'MIXED — see metrics';
    body = `Judge ${bva.F}–${bva.O} (p=${bva.p}); creep A ${A.creep} vs B ${B.creep}. Direction unclear at this n; treat as inconclusive.`;
  }
  const L = ['# Technique A/B — ABLATION of the "Don\'t over-build." directive\n',
    `A single-variable ablation: arm **A** is the full Fable output style with the over-build paragraph REMOVED; arm **B** is the full style. Same ${out.n} narrow, scope-creep-tempting requests; the only difference is that one line. Hook disabled (FABLE_PROFILE=off) so the style is the sole steering source. Deterministic creep score (unrequested try/catch, validation, tests, docs, helpers, "I also…" phrases) + GPT-5.5 forced choice "which did EXACTLY what was asked, nothing extra", both orders.\n`,
    '| arm | creep↓ | clean(0)↑ | words | code lines | try/catch | throws | guards | tests | bonus phrases |',
    '|---|---|---|---|---|---|---|---|---|---|',
    `| A: no over-build line | ${A.creep} | ${A.cleanPct}% | ${A.words} | ${A.codeLines} | ${A.tryCatch} | ${A.throws} | ${A.guards} | ${A.tests} | ${A.bonus} |`,
    `| **B: full Fable** | ${B.creep} | ${B.cleanPct}% | ${B.words} | ${B.codeLines} | ${B.tryCatch} | ${B.throws} | ${B.guards} | ${B.tests} | ${B.bonus} |`,
    '',
    `**B vs A (judge):** B won **${bva.F}–${bva.O}** of ${bva.dec} decided (${bva.F_pct}%, p=${bva.p}); ${bva.tie} position-bias ties.`,
    `**Creep delta:** A ${A.creep} → B ${B.creep} (the directive ${metricWin ? `removes ${creepDrop} units of scope-creep on average` : 'did not reduce scope-creep'}).`,
    '',
    `## Verdict — ${verdict}`,
    body,
    `\nIndependent GPT-5.5 judge; n=${out.n}; clean single-variable ablation (FABLE_PROFILE=off, output style the only manipulated variable).`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-overbuild.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'metrics') metrics();
else if (m === 'judge') await judge();
else if (m === 'report') report();
else if (m === 'clean') cleanupAblatedStyle();
else { await gen(); metrics(); await judge(); report(); }
