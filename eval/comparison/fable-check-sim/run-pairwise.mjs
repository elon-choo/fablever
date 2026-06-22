// run-pairwise.mjs — the discriminating re-test of fable_check (option 1).
//
// Round-1 (run-check-ab.mjs) judged each arm on an absolute 0-100 scale and the judge saturated at 95 /
// accept=100% — no headroom to detect a quality delta. This script fixes that two ways:
//   (1) FORCED-CHOICE PAIRWISE judging: show two deliverables for the same task, the judge MUST pick the one
//       it would ship — no ties, no absolute ceiling. Run BOTH presentation orders and count a win only when
//       the judge picks the same deliverable regardless of order (order-inconsistent = position bias = tie).
//   (2) A harder, hard-to-please rubric.
// Marketing checks (M-cta, M-rec) were brittle in Round 1 (false BLOCKs); server.js now broadens CTA/REC
// detection and relaxes M-cta to "fail only on 3+ competing CTAs". Bigger battery for more blocked tasks.
//
// Arms (unchanged): C = raw Fable draft; T = one revision guided by the gate's specific flags (only when the
// gate BLOCKs); P = one generic "make it excellent" revision (placebo, equal effort, same blocked tasks).
// Pairwise comparisons run ONLY on blocked tasks (where C/T/P differ): T-vs-C, T-vs-P, C-vs-P.
//
// Usage: node run-pairwise.mjs  (gen -> judge -> report, resumable) | node run-pairwise.mjs gen|judge|report

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const OUT = path.join(HERE, 'out2');
const GEN = path.join(OUT, 'gen'), JUD = path.join(OUT, 'judge');
for (const d of [OUT, GEN, JUD]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 2, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 100)); } } })); }

const BATTERY = [
  { id: 'mkt1', dod: 'marketing-copy', prompt: 'Write the hero-section copy (2-3 short paragraphs) for the landing page of a new app called "Inbox Zero AI" that auto-summarizes and triages your email. Make it punchy and ready to ship.', criteria: ['Has a single, clear primary call to action (not several competing ones)', 'Any numeric/social-proof claim is plausible and not obviously fabricated', 'Opens with a compelling hook that conveys the core benefit', 'Concise and on-tone for a consumer SaaS hero section'] },
  { id: 'mkt2', dod: 'marketing-copy', prompt: 'Give me 3 distinct subject-line angles for a re-engagement email to lapsed users of a meditation app, and tell me which one to send.', criteria: ['Offers 3 genuinely distinct angles', 'Makes a clear recommendation of which to send', 'Subject lines are concise and curiosity/benefit-driven', 'No fabricated stats presented as fact'] },
  { id: 'fun1', dod: 'funnel-design', prompt: 'Our B2B SaaS gets plenty of signups but very few convert to paid. Sketch how you would improve the conversion.', criteria: ['Names a specific target metric to move and a timeframe', 'Identifies the single biggest leak/bottleneck rather than listing everything', 'Proposes a concrete first experiment to run', 'Prioritizes rather than giving a flat list of generic tactics'] },
  { id: 'fun2', dod: 'funnel-design', prompt: 'Design the activation funnel for a free-to-paid mobile fitness app and tell me where to focus first.', criteria: ['States the activation metric and a timeframe', 'Pinpoints the biggest drop-off stage', 'Gives a clearly prioritized first test', 'Is specific to a fitness app, not generic'] },
  { id: 'fun3', dod: 'funnel-design', prompt: 'Our e-commerce store has high cart-abandonment. How would you reduce it?', criteria: ['Names the metric and a timeframe', 'Singles out the biggest abandonment driver', 'Gives a prioritized first test', 'Specific, not a generic checklist'] },
  { id: 'res1', dod: 'research', prompt: 'Should an early B2B SaaS startup build its primary datastore on Postgres or MongoDB? Give me your recommendation and reasoning.', criteria: ['Leads with a clear recommendation', 'Backs key claims with reasoning a reader could check (not just assertion)', 'States what would change the answer / the main limitation', 'Balanced — acknowledges the losing option\'s real strengths'] },
  { id: 'res2', dod: 'research', prompt: 'Is server-side rendering worth the added complexity for a content-heavy marketing site? Brief me.', criteria: ['Leads with a clear verdict', 'Supports claims with checkable reasoning', 'States the conditions under which the verdict flips', 'Distinguishes fact from opinion'] },
  { id: 'res3', dod: 'research', prompt: 'For a 20-engineer startup, should we use a monorepo or multiple repos? Recommend and justify.', criteria: ['Leads with a clear recommendation', 'Backs claims with checkable reasoning', 'States what would flip the recommendation', 'Fairly weighs the rejected option'] },
  { id: 'res4', dod: 'research', prompt: 'Is it worth migrating our mobile app\'s API from REST to GraphQL? Brief me with a recommendation.', criteria: ['Leads with a verdict', 'Reasoning is checkable, not assertion', 'Names the conditions that change the answer', 'Acknowledges REST\'s real strengths'] },
  { id: 'doc1', dod: 'doc-planning', prompt: 'Draft a short planning memo for migrating our application logging from a self-hosted ELK stack to a managed service.', criteria: ['Opens with the recommendation/decision, not background', 'Contains an explicit recommendation', 'Surfaces the key risks/open questions honestly', 'Right length and altitude for a decision memo'] },
  { id: 'doc2', dod: 'doc-planning', prompt: 'Write a one-page PRD outline for adding a dark-mode theme to our web app.', criteria: ['Leads with the goal/decision', 'Includes problem, scope, and acceptance criteria', 'Flags open questions rather than silently assuming', 'Concrete enough to act on'] },
  { id: 'doc3', dod: 'doc-planning', prompt: 'Write a brief decision memo on whether to build or buy our internal analytics dashboard.', criteria: ['Opens with a clear build-or-buy recommendation', 'Gives the deciding factors, not a generic pros/cons dump', 'Surfaces the main risk/open question', 'Decision-memo altitude, not an essay'] },
  { id: 'cod1', dod: 'code', prompt: 'This function should return the LAST index of x in arr, but it returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.', criteria: ['The fix is correct (iterates from the end, or tracks the last match)', 'Backs the "done" claim with a check, a traced example, or an explicit note of what is unverified', 'Does not over-edit beyond the bug', 'Explanation matches the code'] },
  { id: 'cod2', dod: 'code', prompt: 'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.', criteria: ['Provides a correct O(n) dedup (e.g. Set-based) preserving order', 'Any performance/speed number is sourced or explicitly marked an estimate, not asserted as measured', 'Preserves original-order semantics', 'Explanation is accurate'] },
  { id: 'cod3', dod: 'code', prompt: 'This pagination helper returns duplicate items across pages when rows are inserted between requests:\n\nfunction page(items, offset, limit){ return items.slice(offset, offset + limit); }\n\nExplain the fix and confirm it works.', criteria: ['Correctly diagnoses offset-based pagination drift and proposes cursor/keyset paging', 'Backs the "works" claim with a check or an explicit unverified note', 'Stays scoped to the bug', 'Explanation is technically accurate'] },
  { id: 'cod4', dod: 'code', prompt: 'Speed up this prime check and tell me how much faster it is:\n\nfunction isPrime(n){ for (let i = 2; i < n; i++) if (n % i === 0) return false; return n > 1; }', criteria: ['Provides a correct faster version (loop to sqrt(n), handle <2)', 'Any speedup figure is sourced/benchmarked or explicitly an estimate, not asserted as measured', 'Correctness preserved on edge cases (0,1,2)', 'Explanation is accurate'] },
];

function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, FABLE_TASTE: 'off' } });
  const pending = new Map(); let buf = '', nid = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(r => { const id = nid++; pending.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }), check: async (text, dod) => { const r = await rpc('tools/call', { name: 'fable_check', arguments: { text, dod_id: dod } }); return JSON.parse(r.result.content[0].text); }, close: () => { try { child.stdin.end(); child.kill(); } catch {} } };
}
function runClaude(prompt) {
  return new Promise(resolve => {
    // Run in a fresh /tmp cwd: claude.exe's native-binary launcher intermittently fails ("native binary not
    // installed") when cwd is inside this repo. Absolute path + /tmp cwd is the combination that is reliable.
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fcab-'); } catch {}
    const done = (txt) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(txt); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genClaude(prompt) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }
const tRevise = (task, draft, fails) => `You drafted the deliverable below for the task. An automated acceptance check flagged the specific gaps listed. Revise the deliverable to fix exactly those gaps; keep everything else intact. Output ONLY the revised deliverable, nothing else.\n\nTASK:\n${task}\n\nYOUR DRAFT:\n${draft}\n\nGAPS THE CHECK FLAGGED:\n${fails.map(f => `- ${f.label} — ${f.gap} (fix: ${f.fix})`).join('\n')}`;
const pRevise = (task, draft) => `You drafted the deliverable below for the task. Review it critically against your own standard for an excellent, ready-to-ship result, and revise it to be as strong as you can make it. Output ONLY the revised deliverable, nothing else.\n\nTASK:\n${task}\n\nYOUR DRAFT:\n${draft}`;

async function generate() {
  const cli = mcpClient(); await cli.init();
  const todo = BATTERY.filter(t => !fs.existsSync(path.join(GEN, t.id + '.json')));
  console.log(`[gen] ${BATTERY.length} tasks, ${todo.length} to run`);
  await pool(todo, GEN_CONC, async (task) => {
    const raw = await genClaude(task.prompt);
    const gate = await cli.check(raw, task.dod);
    const blocked = gate.gate === 'BLOCK';
    const fails = (gate.items || []).filter(i => i.status === 'FAIL');
    let tText = raw, pText = raw, tGate = gate, pGate = gate;
    if (blocked) { tText = await genClaude(tRevise(task.prompt, raw, fails)); pText = await genClaude(pRevise(task.prompt, raw)); tGate = await cli.check(tText, task.dod); pGate = await cli.check(pText, task.dod); }
    fs.writeFileSync(path.join(GEN, task.id + '.json'), JSON.stringify({ id: task.id, dod: task.dod, blocked, raw_fail_ids: fails.map(f => f.id), t_gate: tGate.gate, p_gate: pGate.gate, C: raw, T: tText, P: pText }, null, 2));
    console.log(`[gen] ${task.id} blocked=${blocked} fails=[${fails.map(f => f.id).join(',')}] t_gate=${tGate.gate} p_gate=${pGate.gate}`);
  });
  cli.close();
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) { for (let a = 0; a < 4; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 2000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', x => x.winner !== undefined); if (o) return o; } catch { await new Promise(z => setTimeout(z, 1500 * (a + 1))); } } return null; }
const pairPrompt = (task, criteria, A, B) => `You are a demanding senior reviewer comparing two deliverables produced for the SAME task. Pick the ONE you would actually ship. You MUST choose A or B — ties are not allowed.\n\nBe hard to please. Reward specificity, a decisive and well-supported recommendation, explicitly naming what would change the answer, and tight writing. Penalize generic advice that could apply to any company, hedging, unsupported claims, burying the main point, and padding. Small differences decide it.\n\nTASK:\n${task}\n\nWHAT A GOOD DELIVERABLE MUST DO:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n=== DELIVERABLE A ===\n${A}\n\n=== DELIVERABLE B ===\n${B}\n\nOutput ONLY this JSON on the last line: {"winner":"A or B","why":"one sentence on the deciding difference"}`;

const PAIRS = [['T', 'C'], ['T', 'P'], ['C', 'P']];
async function judge() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean).filter(g => g.blocked);
  const jobs = [];
  for (const g of gens) { const task = BATTERY.find(t => t.id === g.id); for (const [X, Y] of PAIRS) { jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o1', A: X, B: Y, Atext: g[X], Btext: g[Y], task }); jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o2', A: Y, B: X, Atext: g[Y], Btext: g[X], task }); } }
  const todo = jobs.filter(j => !fs.existsSync(path.join(JUD, `${j.id}__${j.pair}__${j.order}.json`)));
  console.log(`[judge] ${gens.length} blocked tasks, ${jobs.length} pairwise calls, ${todo.length} to run`); let done = 0;
  await pool(todo, JUDGE_CONC, async (j) => {
    const v = await callGemini(pairPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)'));
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(path.join(JUD, `${j.id}__${j.pair}__${j.order}.json`), JSON.stringify({ id: j.id, pair: j.pair, order: j.order, A: j.A, B: j.B, winnerSlot: w, winnerArm: w === 'A' ? j.A : j.B, why: v.why }, null, 2)); }
    done++; console.log(`[judge] ${done}/${todo.length} ${j.id} ${j.pair} ${j.order} -> ${v ? (String(v.winner).toUpperCase().includes('B') ? j.B : j.A) : 'NULL'}`);
  });
}

function report() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const blocked = gens.filter(g => g.blocked);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  // order-consistent winner per (task, pair): both orders must agree on the same ARM.
  const tally = {}; for (const [X, Y] of PAIRS) tally[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0, n: 0 };
  const detail = [];
  for (const g of blocked) for (const [X, Y] of PAIRS) {
    const o1 = J[`${g.id}__${X}v${Y}__o1`], o2 = J[`${g.id}__${X}v${Y}__o2`];
    if (!o1 || !o2) continue;
    const t = tally[`${X}v${Y}`]; t.n++;
    let res;
    if (o1.winnerArm === o2.winnerArm) { t[o1.winnerArm]++; res = o1.winnerArm; } else { t.tie++; res = 'tie(order-bias)'; }
    detail.push(`${g.id} ${X}v${Y}: ${res}`);
  }
  const blockRate = blocked.length && gens.length ? +(100 * blocked.length / gens.length).toFixed(1) : 0;
  const tCleared = blocked.length ? +(100 * blocked.filter(g => g.t_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const pCleared = blocked.length ? +(100 * blocked.filter(g => g.p_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const out = { n_tasks: gens.length, n_blocked: blocked.length, block_rate_pct: blockRate, blocked_on: blocked.map(g => ({ id: g.id, dod: g.dod, fails: g.raw_fail_ids })), objective_gate_clear: { T_pct: tCleared, P_pct: pCleared }, pairwise_order_consistent: tally };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  const winLine = (X, Y) => { const t = tally[`${X}v${Y}`]; const dec = t[X] + t[Y]; return `**${X} vs ${Y}** (n=${t.n}): ${X} wins ${t[X]}, ${Y} wins ${t[Y]}, order-bias ties ${t.tie}.  ${dec ? `Among decided: ${X} ${+(100 * t[X] / dec).toFixed(0)}% / ${Y} ${+(100 * t[Y] / dec).toFixed(0)}%` : 'no decided pairs'}`; };
  const L = ['# fable_check — pairwise forced-choice re-test (option 1)\n',
    `${out.n_tasks} deliverable tasks; gate fired on **${out.n_blocked}/${out.n_tasks}** (${blockRate}%) after the marketing-check fix. On each blocked task, a demanding Gemini judge made FORCED-CHOICE pairwise picks (no ties, both presentation orders). A win counts ONLY when the judge picks the same arm in both orders; disagreement = position bias = tie.\n`,
    '## Order-consistent pairwise wins on blocked tasks',
    winLine('T', 'C') + '  ← does the gate-guided revision beat the raw draft',
    winLine('T', 'P') + '  ← **the real question: deterministic gate vs a generic second pass**',
    winLine('C', 'P') + '  ← does any second pass beat the raw draft',
    '',
    '## Objective check (no judge): did the revision clear the gate?',
    `- T (gate-guided) cleared on ${tCleared}% of blocked tasks; P (generic) on ${pCleared}%.`,
    '',
    '## Which tasks blocked, and on what',
    ...blocked.map(g => `- ${g.id} (${g.dod}): ${g.raw_fail_ids.join(', ')}`),
    '',
    '## Per-pair detail', ...detail.map(d => `- ${d}`),
    '',
    'Small-N pilot (cluster = task); directional. Forced-choice + both-orders removes the absolute-score ceiling and controls position bias. If T beats C and P, the deterministic gate adds real signal a generic pass misses; if T ties C/P, the gate is not a quality lever even when applied perfectly.',
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'gen') await generate();
else if (phase === 'judge') await judge();
else if (phase === 'report') report();
else { await generate(); await judge(); report(); }
