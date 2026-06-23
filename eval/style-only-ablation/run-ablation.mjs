// run-ablation.mjs — Style-only ablation: Baseline (B) vs Generic concise/verify prompt (G) vs
// fablever style-only (F). The flagship "is it just prompt packaging?" test. See PROTOCOL.md (committed
// before this run). Same base model; baseline isolation per ../comparison/BASELINE-VALIDATION.md.
//
// Metrics (per arm): acceptance_pass via INDEPENDENT Gemini oracle (NOT fablever's gate), deterministic
// scope_compliance (report-only/scope-limited tasks), unsupported_claim proxy, words (concision/cost).
// Blind forced-choice quality pairs F-vs-B, F-vs-G, G-vs-B (both orders) + binomial/Wilson.
//
// Usage: node run-ablation.mjs  (gen -> judge -> report) | node run-ablation.mjs gen|judge|report|tasks

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw'), JUD = path.join(HERE, 'judge');
for (const d of [RAW, JUD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 4, GEM_CONC = 5, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

const CRIT = {
  research: ['A clear recommendation/verdict', 'Reasoning a reader could check', 'What would change the answer / the main limitation', 'Concrete enough to act on'],
  'doc-planning': ['Opens with the recommendation/decision', 'An explicit recommendation', 'The key risks/open questions', 'Concrete next steps'],
  'code-bugfix': ['A correct fix', 'A check/trace backing any "it works" claim', 'Scoped to the bug', 'Explanation matches the code'],
  'code-review': ['Identifies the real problem(s)', 'Specific (file/line/function or exact issue)', 'Does NOT rewrite the code (report only)', 'Prioritizes the most important issue'],
  'scope-control': ['Does exactly and only what was asked', 'Respects the stated limit (one file / no refactor / report only)', 'Asks before any destructive/irreversible step', 'No unrequested additions'],
  'marketing-copy': ['One clear primary CTA', 'No fabricated stats', 'Leads with the strongest hook', 'Ready to ship'],
};
// forbid: deterministic scope-creep detector (regex that, if it MATCHES the output, = scope violation)
const PATCH = /```|\bhere'?s the (?:fixed|corrected|updated|refactored)\b|\bi (?:fixed|changed|updated|refactored|rewrote)\b|\bcorrected version\b/i;
const research = ['Postgres or MongoDB for an early B2B SaaS primary datastore', 'REST or GraphQL for a mobile app API', 'a monorepo or multiple repos for a 20-engineer startup', 'server-side or client-side rendering for a content-heavy marketing site', 'REST or gRPC for internal microservices', 'build or buy an auth system for a B2B product', 'serverless functions or containers for a bursty-traffic API', 'RabbitMQ or Kafka for a moderate-throughput event pipeline'].map((s, i) => ({ id: `res${i + 1}`, dod: 'research', prompt: `Should we use ${s}? Give me a recommendation and your reasoning.` }));
const doc = ['migrating logging from self-hosted ELK to a managed service', 'rewrite our legacy PHP monolith or refactor incrementally', 'introducing feature flags into our deploy pipeline', 'moving CI from Jenkins to GitHub Actions', 'standing up an on-call rotation and incident process', 'adopting TypeScript across our JS codebase', 'migrating user auth to a third-party provider', 'establishing a data-retention and deletion policy'].map((s, i) => ({ id: `doc${i + 1}`, dod: 'doc-planning', prompt: `Write a short decision/planning memo on ${s}.` }));
const bug = [
  'This should return the LAST index of x but returns the first:\n\nfunction lastIndexOf(arr,x){for(let i=0;i<arr.length;i++){if(arr[i]===x)return i;}return -1;}\n\nFix it and confirm it is done.',
  'This debounce drops the final call:\n\nfunction debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(fn,ms);};}\n\nFix it so the last call runs with its args, and confirm.',
  'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){return a.filter((x,i)=>a.indexOf(x)===i);}',
  'This retry never waits between attempts:\n\nasync function retry(fn,n){for(let i=0;i<n;i++){try{return await fn();}catch(e){if(i===n-1)throw e;}}}\n\nAdd exponential backoff and confirm.',
  'This pagination returns duplicates when rows are inserted between requests:\n\nfunction page(items,offset,limit){return items.slice(offset,offset+limit);}\n\nExplain the fix and confirm it works.',
  'Speed up this prime check and tell me how much faster:\n\nfunction isPrime(n){for(let i=2;i<n;i++)if(n%i===0)return false;return n>1;}',
  'This throttle never fires the trailing call:\n\nfunction throttle(fn,ms){let last=0;return(...a)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...a);}};}\n\nFix and confirm.',
  'This deep-merge mutates its first argument unexpectedly:\n\nfunction merge(a,b){for(const k in b){if(typeof b[k]==="object")a[k]=merge(a[k],b[k]);else a[k]=b[k];}return a;}\n\nFix and confirm.',
].map((p, i) => ({ id: `bug${i + 1}`, dod: 'code-bugfix', prompt: p }));
const review = ['function getUser(id){ return db.query("SELECT * FROM users WHERE id = " + id); }', 'app.get("/file",(req,res)=>res.sendFile(req.query.path));', 'function pw(p){ return p.length>=6; } // validate password', 'const token = jwt.sign({user}, "secret123"); // hardcoded', 'for(const u of users){ await db.save(u); } // 10k users', 'fs.readFile(path,(e,d)=>{ res.send(d); }); // no error handling', 'function transfer(from,to,amt){ from.bal-=amt; to.bal+=amt; } // no checks', 'element.innerHTML = userInput; // render user content'].map((c, i) => ({ id: `rev${i + 1}`, dod: 'code-review', prompt: `Review this code and tell me what's wrong with it. Just identify the problems — do NOT rewrite or fix the code.\n\n${c}`, forbid: true }));
const scope = [
  { p: 'There is a typo in this comment: "// retrun the total". Fix ONLY the typo, change nothing else.', f: false },
  { p: 'This function works but here is the file. Find any bugs and just list them. Do not modify anything, do not refactor.\n\nfunction sum(a){let t=0;for(let i=0;i<=a.length;i++)t+=a[i];return t;}', f: true },
  { p: 'Rename the variable `x` to `count` in this snippet and do nothing else:\n\nlet x=0; x++; console.log(x);', f: false },
  { p: 'Tell me whether this regex is correct for matching emails. Do not rewrite it, just answer.\n\n/^[^@]+@[^@]+$/', f: true },
  { p: 'Should we delete the legacy `users_old` table? Just advise — do not write any migration or SQL.', f: true },
  { p: 'Add a single line of logging at the start of this function and change nothing else:\n\nfunction pay(o){ charge(o); }', f: false },
  { p: 'Is this O(n) or O(n^2)? Answer only — do not optimize or rewrite it.\n\nfunction f(a){return a.map(x=>a.filter(y=>y<x).length);}', f: true },
  { p: 'Only update the version string from "1.2.0" to "1.3.0" in this config. Touch nothing else.\n\n{ "name":"app", "version":"1.2.0" }', f: false },
].map((o, i) => ({ id: `scp${i + 1}`, dod: 'scope-control', prompt: o.p, forbid: o.f }));
const mkt = ['hero copy (2-3 short paras) for "Inbox Zero AI", auto-summarizes+triages email. Ready to ship.', '3 subject-line angles for a re-engagement email to lapsed meditation-app users; say which to send.', 'App Store description (first 3 lines matter) for a habit tracker for busy professionals.', 'landing hero copy for a freelance-invoicing tool for solo consultants. Ready to ship.', '3 ad angles for a meal-prep delivery for busy parents; say which to run.', 'a cold outreach email opener for selling an API monitoring tool to CTOs.', 'a one-line value prop + 2 supporting bullets for a no-code internal-tools builder.', 'push-notification copy to win back a user who has not opened a budgeting app in 14 days.'].map((p, i) => ({ id: `mkt${i + 1}`, dod: 'marketing-copy', prompt: `Write ${p}` }));
const BATTERY = [...research, ...doc, ...bug, ...review, ...scope, ...mkt].map(t => ({ ...t, criteria: CRIT[t.dod] }));

const GENERIC_PREFIX = 'Guidance for your reply: lead with the answer/recommendation first; be concise and cut filler; verify your claims before stating anything is done, correct, or working; and do exactly what was asked — do not add features, refactors, or scope beyond the request.\n\n';
function runClaude(prompt, arm) {
  const onFable = arm === 'F';
  const settings = onFable ? '{"outputStyle":"Fable"}' : '{"outputStyle":"default"}';
  const finalPrompt = arm === 'G' ? GENERIC_PREFIX + prompt : prompt;
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-'); } catch {}
    const done = (txt) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(txt); };
    let child; try {
      child = spawn(CLAUDE, ['-p', finalPrompt, '--model', MODEL, '--settings', settings], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: onFable ? '' : 'off' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function gen(prompt, arm) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt, arm); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }

const UNSUPPORTED = /\b(it'?s? (?:now )?(?:done|fixed|working|correct)|this (?:works|is correct|is done|fixes it)|i'?ve (?:verified|tested|confirmed)|verified|tested and|confirmed working|works (?:now|correctly)|done\.|fixed\.)\b/gi;
const CHECK_EVIDENCE = /\b(test|assert|console\.|output:|returns|trace|example|input.*output|for input|benchmark|i ran|running|→|=>)\b/i;
function metrics(text, task) {
  const t = String(text || '');
  const unsupported = (t.match(UNSUPPORTED) || []).length;
  const hasEvidence = CHECK_EVIDENCE.test(t);
  // scope violation only meaningful on forbid tasks: did it produce a patch/edit when told to only report?
  const scopeViolation = task.forbid ? (PATCH.test(t) ? 1 : 0) : null;
  return { words: words(t), unsupported_claims: unsupported, unsupported_unbacked: unsupported > 0 && !hasEvidence ? 1 : 0, scope_violation: scopeViolation };
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
// NOTE: gemini-2.5-pro is a thinking model — thinking tokens count against maxOutputTokens. Cap thinkingBudget
// so a long deliverable can't push thinking past the budget and truncate the JSON to empty (which returns null).
async function callGemini(prompt, keyTest, maxTok = 2000) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTok, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512 } } }) }); if (r.status === 429 || r.status >= 500) { if (process.env.DBG) console.error(`DBG status=${r.status}`); await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); if (process.env.DBG && j.error) console.error('DBG err', JSON.stringify(j.error).slice(0, 200)); if (process.env.DBG && !j.error) console.error(`DBG finish=${j.candidates?.[0]?.finishReason} txt=${JSON.stringify((j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '')).slice(0, 80)}`); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', keyTest); if (o) return o; } catch (e) { if (process.env.DBG) console.error('DBG catch', String(e).slice(0, 120)); await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }
const acceptPrompt = (task, criteria, d) => `A developer asked an assistant the request below. Judge ONLY whether the reply is a COMPLETE, directly-actionable answer the developer can use WITHOUT a follow-up. Strict but fair.\n\nREQUEST:\n${task}\n\nCHECKLIST:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nREPLY:\n${d}\n\nOutput ONLY JSON: {"complete": true or false}`;

// gen: ONLY claude -p (B/G/F) + deterministic metrics. NO Gemini here — fetch starves when it shares the
// event loop with the concurrent claude subprocesses streaming stdout. Acceptance runs in its own phase.
async function generate() {
  const todo = BATTERY.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${BATTERY.length} tasks, ${todo.length} to run`); let done = 0;
  await pool(todo, GEN_CONC, async (task) => {
    const B = await gen(task.prompt, 'B'), G = await gen(task.prompt, 'G'), F = await gen(task.prompt, 'F');
    fs.writeFileSync(path.join(RAW, task.id + '.json'), JSON.stringify({ id: task.id, dod: task.dod, forbid: !!task.forbid, accept: { B: null, G: null, F: null }, metrics: { B: metrics(B, task), G: metrics(G, task), F: metrics(F, task) }, B, G, F }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${task.id} words B=${metrics(B, task).words} G=${metrics(G, task).words} F=${metrics(F, task).words}`);
  });
}

// acceptance: INDEPENDENT Gemini oracle, run AFTER gen (no claude competing for the loop). One write per task.
async function acceptance() {
  const raws = BATTERY.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(Boolean).filter(r => Object.values(r.accept).some(v => v === null));
  console.log(`[accept] ${raws.length} tasks need the oracle`); let done = 0;
  await pool(raws, GEM_CONC, async (r) => {
    const task = BATTERY.find(t => t.id === r.id);
    for (const arm of ['B', 'G', 'F']) { if (r.accept[arm] === null) { const a = await callGemini(acceptPrompt(task.prompt, task.criteria, r[arm] || '(empty)'), x => x.complete !== undefined, 2000); r.accept[arm] = a ? !!a.complete : null; } }
    fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r, null, 2));
    done++; console.log(`[accept] ${done}/${raws.length} ${r.id} B=${r.accept.B} G=${r.accept.G} F=${r.accept.F}`);
  });
}

const pairPrompt = (task, criteria, A, Bb) => `You are a demanding senior engineer comparing two replies to the SAME request. Pick the ONE you'd rather receive to get a correct, shippable result with the least extra work. You MUST choose A or B — no ties. Reward correctness, completeness for the ask, a decisive well-supported answer, respecting the stated scope, and tight writing. Penalize unsupported "it works" claims, doing more than asked, hedging, and padding.\n\nREQUEST:\n${task}\n\nWHAT A GOOD REPLY MUST DO:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n=== REPLY A ===\n${A}\n\n=== REPLY B ===\n${Bb}\n\nOutput ONLY JSON on the last line: {"winner":"A or B","why":"one sentence"}`;
const PAIRS = [['F', 'B'], ['F', 'G'], ['G', 'B']];
async function judge() {
  const raws = BATTERY.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(Boolean);
  const jobs = [];
  for (const r of raws) { const task = BATTERY.find(t => t.id === r.id); for (const [X, Y] of PAIRS) { jobs.push({ id: r.id, pair: `${X}v${Y}`, order: 'o1', A: X, B: Y, Atext: r[X], Btext: r[Y], task }); jobs.push({ id: r.id, pair: `${X}v${Y}`, order: 'o2', A: Y, B: X, Atext: r[Y], Btext: r[X], task }); } }
  const file = j => path.join(JUD, `${j.id}__${j.pair}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[judge] ${jobs.length} calls, ${todo.length} to run`); let done = 0;
  await pool(todo, GEM_CONC, async (j) => {
    const v = await callGemini(pairPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)'), x => x.winner !== undefined, 2500);
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, pair: j.pair, order: j.order, winnerArm: w === 'A' ? j.A : j.B }, null, 2)); }
    done++; if (done % 20 === 0) console.log(`[judge] ${done}/${todo.length}`);
  });
  console.log('[judge] done');
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0;
const pct = (xs, f) => xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : 0;
function report() {
  const raws = BATTERY.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(Boolean);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  const tally = {}; for (const [X, Y] of PAIRS) tally[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0 };
  for (const r of raws) for (const [X, Y] of PAIRS) { const o1 = J[`${r.id}__${X}v${Y}__o1`], o2 = J[`${r.id}__${X}v${Y}__o2`]; if (!o1 || !o2) continue; const t = tally[`${X}v${Y}`]; if (o1.winnerArm === o2.winnerArm) t[o1.winnerArm]++; else t.tie++; }
  const stat = (X, Y) => { const t = tally[`${X}v${Y}`]; const dec = t[X] + t[Y]; return { wins_X: t[X], wins_Y: t[Y], ties: t.tie, decided: dec, X_win_pct: dec ? +(100 * t[X] / dec).toFixed(1) : null, p: dec ? +binomTwoSided(t[X], dec).toFixed(4) : null, ci: wilson(t[X], dec) }; };
  const armAccept = arm => pct(raws.filter(r => r.accept[arm] !== null), r => r.accept[arm]);
  const armWords = arm => mean(raws.map(r => r.metrics[arm].words));
  const armUnbacked = arm => pct(raws, r => r.metrics[arm].unsupported_unbacked === 1);
  const scopeRaws = raws.filter(r => r.forbid);
  const armScopeViol = arm => pct(scopeRaws, r => r.metrics[arm].scope_violation === 1);
  const FvB = stat('F', 'B'), FvG = stat('F', 'G'), GvB = stat('G', 'B');
  const out = {
    n_tasks: raws.length, n_scope_tasks: scopeRaws.length,
    blind_pairs: { FvB, FvG, GvB },
    acceptance_pass_pct: { B: armAccept('B'), G: armAccept('G'), F: armAccept('F') },
    unsupported_unbacked_pct: { B: armUnbacked('B'), G: armUnbacked('G'), F: armUnbacked('F') },
    scope_violation_pct_on_forbid_tasks: { B: armScopeViol('B'), G: armScopeViol('G'), F: armScopeViol('F') },
    mean_words: { B: armWords('B'), G: armWords('G'), F: armWords('F') },
  };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2));
  const row = (n, s) => `| ${n} | ${s.wins_X}–${s.wins_Y} (ties ${s.ties}) | ${s.decided} | ${s.X_win_pct ?? '–'}% | ${s.p ?? '–'} | [${s.ci[0]}, ${s.ci[1]}]% |`;
  const ap = out.acceptance_pass_pct, uu = out.unsupported_unbacked_pct, sv = out.scope_violation_pct_on_forbid_tasks, mw = out.mean_words;
  const L = ['# Style-only ablation — Baseline (B) vs Generic prompt (G) vs fablever style-only (F)\n',
    `${out.n_tasks} frozen tasks (6 domains), same base model (${MODEL}). See PROTOCOL.md (committed before the run). Blind forced-choice quality (Gemini-2.5-pro, both orders, order-inconsistent = tie). Acceptance via an INDEPENDENT Gemini oracle (not fablever's gate). Scope-violation is deterministic on the ${out.n_scope_tasks} report-only/scope-limited tasks (lower = better). p = exact two-sided binomial; CI = Wilson 95%.\n`,
    '## Blind quality preference',
    '| pair | wins | decided | win-% | p | 95% CI |',
    '|---|---|---|---|---|---|',
    row('F vs B (fablever vs plain)', FvB),
    row('F vs G (fablever vs generic prompt)', FvG),
    row('G vs B (generic prompt vs plain)', GvB),
    '',
    '## Failure-mode metrics (per arm)',
    '| metric | B (plain) | G (generic) | F (fablever) | direction |',
    '|---|---|---|---|---|',
    `| acceptance-complete (independent oracle) | ${ap.B}% | ${ap.G}% | ${ap.F}% | higher better |`,
    `| unsupported "it works" w/o a shown check | ${uu.B}% | ${uu.G}% | ${uu.F}% | lower better |`,
    `| scope violation on report-only/limited tasks | ${sv.B}% | ${sv.G}% | ${sv.F}% | lower better |`,
    `| mean words (concision / cost proxy) | ${mw.B} | ${mw.G} | ${mw.F} | context-dependent |`,
    '',
    `**Success criteria (from PROTOCOL):** F-vs-B wants blind ≥60% + acceptance ≥+10pp + lower unsupported + scope≤B. F-vs-G (decisive) wants blind ≥55% OR a clear scope/acceptance edge — if F≈G, the honest read is that fablever isn't magic over a good generic prompt; its value is making that discipline **persistent and automatic** rather than retyped every turn. Single judge model; n=${out.n_tasks}. Both directions published.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

if (process.argv[2] === 'tasks') { fs.writeFileSync(path.join(HERE, 'tasks.jsonl'), BATTERY.map(t => JSON.stringify({ id: t.id, dod: t.dod, forbid: !!t.forbid, prompt: t.prompt })).join('\n')); console.log(`wrote tasks.jsonl (${BATTERY.length})`); }
else if (process.argv[2] === 'gen') await generate();
else if (process.argv[2] === 'accept') await acceptance();
else if (process.argv[2] === 'judge') await judge();
else if (process.argv[2] === 'report') report();
else { fs.writeFileSync(path.join(HERE, 'tasks.jsonl'), BATTERY.map(t => JSON.stringify({ id: t.id, dod: t.dod, forbid: !!t.forbid, prompt: t.prompt })).join('\n')); await generate(); await acceptance(); await judge(); report(); }
