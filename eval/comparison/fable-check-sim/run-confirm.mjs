// run-confirm.mjs — confirmatory, higher-powered, two-judge re-test of fable_check.
//
// run-pairwise.mjs (out2) found T > P > C order-consistently on 7 blocked tasks with one judge. This raises
// the bar: ~22 tasks weighted toward the gate's wheelhouse (research/funnel/doc) for more blocked tasks, and
// a SECOND, cross-provider judge. Forced-choice pairwise, both presentation orders, win counted only when a
// judge picks the same arm in both orders (order-inconsistent = position bias = tie).
//   Judge 1 = Gemini-2.5-pro on all three pairs (T-vs-C, T-vs-P, C-vs-P).
//   Judge 2 = GPT-5.5 (codex) on the decisive T-vs-P pair only (slow ~90s/call; best-effort, may skip).
// Arms identical to before: C raw Fable draft; T = one revision guided by the gate's specific flags (only on
// BLOCKed tasks); P = one generic "make it excellent" revision (placebo, equal effort, same blocked tasks).
//
// Usage: node run-confirm.mjs  (gen -> judge -> report, resumable) | node run-confirm.mjs gen|judge|report

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const OUT = path.join(HERE, 'out3');
const GEN = path.join(OUT, 'gen'), JUD = path.join(OUT, 'judge');
for (const d of [OUT, GEN, JUD]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 2, GEM_CONC = 3, GPT_CONC = 2, GEN_TIMEOUT_MS = 200000, GPT_TIMEOUT_MS = 160000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 100)); } } })); }

const C4 = (...c) => c; // criteria helper
const BATTERY = [
  { id: 'mkt1', dod: 'marketing-copy', prompt: 'Write the hero-section copy (2-3 short paragraphs) for the landing page of a new app called "Inbox Zero AI" that auto-summarizes and triages your email. Make it punchy and ready to ship.', criteria: C4('Single clear primary CTA, not several competing ones', 'No obviously fabricated social-proof/number', 'Compelling hook conveying the core benefit', 'Concise and on-tone for a consumer SaaS hero') },
  { id: 'mkt2', dod: 'marketing-copy', prompt: 'Give me 3 distinct subject-line angles for a re-engagement email to lapsed users of a meditation app, and tell me which one to send.', criteria: C4('3 genuinely distinct angles', 'A clear recommendation of which to send', 'Subject lines concise and curiosity/benefit-driven', 'No fabricated stats as fact') },
  { id: 'mkt3', dod: 'marketing-copy', prompt: 'Write a short App Store description (first 3 lines matter most) for a habit-tracking app aimed at busy professionals.', criteria: C4('A single clear CTA or next step', 'No fabricated stats', 'Leads with the strongest benefit in the first line', 'Tight and scannable') },
  { id: 'fun1', dod: 'funnel-design', prompt: 'Our B2B SaaS gets plenty of signups but very few convert to paid. Sketch how you would improve the conversion.', criteria: C4('Names a specific target metric and a timeframe', 'Identifies the single biggest leak, not a list', 'Proposes a concrete first experiment', 'Prioritizes rather than a flat generic list') },
  { id: 'fun2', dod: 'funnel-design', prompt: 'Design the activation funnel for a free-to-paid mobile fitness app and tell me where to focus first.', criteria: C4('States the activation metric and a timeframe', 'Pinpoints the biggest drop-off stage', 'Clearly prioritized first test', 'Specific to a fitness app') },
  { id: 'fun3', dod: 'funnel-design', prompt: 'Our e-commerce store has high cart-abandonment. How would you reduce it?', criteria: C4('Names the metric and a timeframe', 'Singles out the biggest abandonment driver', 'A prioritized first test', 'Specific, not a generic checklist') },
  { id: 'fun4', dod: 'funnel-design', prompt: 'Our mobile app has good installs but poor day-7 retention. How do you fix it?', criteria: C4('Names the retention metric and a timeframe', 'Singles out the biggest early-drop cause', 'A prioritized first test', 'Specific, not generic') },
  { id: 'fun5', dod: 'funnel-design', prompt: 'Design the free-to-paid upgrade funnel for a note-taking SaaS and tell me where to focus first.', criteria: C4('States the upgrade metric and a timeframe', 'Pinpoints the biggest upgrade blocker', 'A prioritized first test', 'Specific to a note-taking SaaS') },
  { id: 'res1', dod: 'research', prompt: 'Should an early B2B SaaS startup build its primary datastore on Postgres or MongoDB? Give me your recommendation and reasoning.', criteria: C4('Leads with a clear recommendation', 'Backs claims with checkable reasoning', 'States what would change the answer', 'Acknowledges the loser\'s real strengths') },
  { id: 'res2', dod: 'research', prompt: 'Is server-side rendering worth the added complexity for a content-heavy marketing site? Brief me.', criteria: C4('Leads with a clear verdict', 'Checkable reasoning, not assertion', 'States when the verdict flips', 'Distinguishes fact from opinion') },
  { id: 'res3', dod: 'research', prompt: 'For a 20-engineer startup, should we use a monorepo or multiple repos? Recommend and justify.', criteria: C4('Leads with a clear recommendation', 'Checkable reasoning', 'States what would flip it', 'Fairly weighs the rejected option') },
  { id: 'res4', dod: 'research', prompt: 'Is it worth migrating our mobile app\'s API from REST to GraphQL? Brief me with a recommendation.', criteria: C4('Leads with a verdict', 'Reasoning is checkable', 'Names the conditions that change the answer', 'Acknowledges REST\'s strengths') },
  { id: 'res5', dod: 'research', prompt: 'Should we use REST or gRPC for communication between our internal microservices? Recommend.', criteria: C4('Leads with a recommendation', 'Checkable reasoning', 'States what would change it', 'Weighs the rejected option fairly') },
  { id: 'res6', dod: 'research', prompt: 'Is adopting Kubernetes worth it for a 3-service backend, or is it overkill? Brief me.', criteria: C4('Leads with a verdict', 'Checkable reasoning', 'Names when the answer flips', 'Acknowledges the other side') },
  { id: 'doc1', dod: 'doc-planning', prompt: 'Draft a short planning memo for migrating our application logging from a self-hosted ELK stack to a managed service.', criteria: C4('Opens with the recommendation/decision', 'Contains an explicit recommendation', 'Surfaces key risks/open questions', 'Decision-memo altitude') },
  { id: 'doc2', dod: 'doc-planning', prompt: 'Write a one-page PRD outline for adding a dark-mode theme to our web app.', criteria: C4('Leads with the goal/decision', 'Has problem, scope, acceptance criteria', 'Flags open questions', 'Concrete enough to act on') },
  { id: 'doc3', dod: 'doc-planning', prompt: 'Write a brief decision memo on whether to build or buy our internal analytics dashboard.', criteria: C4('Opens with a clear build-or-buy recommendation', 'Deciding factors, not a generic pros/cons dump', 'Surfaces the main risk', 'Decision-memo altitude') },
  { id: 'doc4', dod: 'doc-planning', prompt: 'Write a decision memo on whether to rewrite our legacy PHP monolith or refactor it incrementally.', criteria: C4('Opens with a clear recommendation', 'Deciding factors specific to this choice', 'Surfaces the main risk', 'Decision-memo altitude') },
  { id: 'cod1', dod: 'code', prompt: 'This function should return the LAST index of x in arr, but it returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.', criteria: C4('Correct fix (iterate from end / track last match)', 'Backs the done-claim with a check, traced example, or explicit unverified note', 'No over-edit beyond the bug', 'Explanation matches the code') },
  { id: 'cod2', dod: 'code', prompt: 'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.', criteria: C4('Correct O(n) order-preserving dedup', 'Any speed number is sourced or marked an estimate', 'Preserves original order', 'Accurate explanation') },
  { id: 'cod3', dod: 'code', prompt: 'This pagination helper returns duplicate items across pages when rows are inserted between requests:\n\nfunction page(items, offset, limit){ return items.slice(offset, offset + limit); }\n\nExplain the fix and confirm it works.', criteria: C4('Correctly diagnoses offset drift and proposes cursor/keyset paging', 'Backs the works-claim with a check or explicit unverified note', 'Scoped to the bug', 'Technically accurate') },
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
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fccf-'); } catch {}
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
function callCodex(prompt) { return new Promise(resolve => { let out = ''; const c = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', prompt], { env: process.env }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} }, GPT_TIMEOUT_MS); c.stdout.on('data', d => out += d); c.stderr.on('data', () => {}); c.on('close', () => { clearTimeout(t); resolve(extractJSON(out, x => x.winner !== undefined)); }); c.on('error', () => { clearTimeout(t); resolve(null); }); }); }
const pairPrompt = (task, criteria, A, B) => `You are a demanding senior reviewer comparing two deliverables produced for the SAME task. Pick the ONE you would actually ship. You MUST choose A or B — ties are not allowed.\n\nBe hard to please. Reward specificity, a decisive and well-supported recommendation, explicitly naming what would change the answer, and tight writing. Penalize generic advice that could apply to any company, hedging, unsupported claims, burying the main point, and padding. Small differences decide it.\n\nTASK:\n${task}\n\nWHAT A GOOD DELIVERABLE MUST DO:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n=== DELIVERABLE A ===\n${A}\n\n=== DELIVERABLE B ===\n${B}\n\nOutput ONLY this JSON on the last line: {"winner":"A or B","why":"one sentence on the deciding difference"}`;

const PAIRS = [['T', 'C'], ['T', 'P'], ['C', 'P']];
function jobsFor(g) {
  const task = BATTERY.find(t => t.id === g.id); const out = [];
  for (const [X, Y] of PAIRS) {
    out.push({ id: g.id, pair: `${X}v${Y}`, order: 'o1', judge: 'gem', A: X, B: Y, Atext: g[X], Btext: g[Y], task });
    out.push({ id: g.id, pair: `${X}v${Y}`, order: 'o2', judge: 'gem', A: Y, B: X, Atext: g[Y], Btext: g[X], task });
  }
  // codex (gpt) only on the decisive T-vs-P pair, both orders
  out.push({ id: g.id, pair: 'TvP', order: 'o1', judge: 'gpt', A: 'T', B: 'P', Atext: g.T, Btext: g.P, task });
  out.push({ id: g.id, pair: 'TvP', order: 'o2', judge: 'gpt', A: 'P', B: 'T', Atext: g.P, Btext: g.T, task });
  return out;
}
async function judge() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean).filter(g => g.blocked);
  const all = gens.flatMap(jobsFor);
  const file = j => path.join(JUD, `${j.id}__${j.pair}__${j.order}__${j.judge}.json`);
  const run = async (j) => {
    if (fs.existsSync(file(j))) return;
    const v = j.judge === 'gem' ? await callGemini(pairPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)')) : await callCodex(pairPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)'));
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, pair: j.pair, order: j.order, judge: j.judge, winnerArm: w === 'A' ? j.A : j.B, why: v.why }, null, 2)); }
    console.log(`[judge:${j.judge}] ${j.id} ${j.pair} ${j.order} -> ${v ? (String(v.winner).toUpperCase().includes('B') ? j.B : j.A) : 'NULL'}`);
  };
  const gem = all.filter(j => j.judge === 'gem'), gpt = all.filter(j => j.judge === 'gpt');
  console.log(`[judge] ${gens.length} blocked tasks; gemini ${gem.length} calls, codex ${gpt.length} calls`);
  await Promise.all([pool(gem, GEM_CONC, run), pool(gpt, GPT_CONC, run)]);
  console.log('[judge] done');
}

function tallyFor(judge, gens) {
  const J = {}; for (const f of fs.readdirSync(JUD)) { if (!f.endsWith(`__${judge}.json`)) continue; const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  const tally = {}; for (const [X, Y] of PAIRS) tally[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0, n: 0 };
  const consistentTvP = {};
  for (const g of gens) for (const [X, Y] of PAIRS) {
    if (judge === 'gpt' && `${X}v${Y}` !== 'TvP') continue;
    const o1 = J[`${g.id}__${X}v${Y}__o1`], o2 = J[`${g.id}__${X}v${Y}__o2`];
    if (!o1 || !o2) continue;
    const t = tally[`${X}v${Y}`]; t.n++;
    if (o1.winnerArm === o2.winnerArm) { t[o1.winnerArm]++; if (`${X}v${Y}` === 'TvP') consistentTvP[g.id] = o1.winnerArm; }
    else { t.tie++; if (`${X}v${Y}` === 'TvP') consistentTvP[g.id] = 'tie'; }
  }
  return { tally, consistentTvP };
}
function report() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const blocked = gens.filter(g => g.blocked);
  const blockRate = +(100 * blocked.length / gens.length).toFixed(1);
  const tCleared = blocked.length ? +(100 * blocked.filter(g => g.t_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const pCleared = blocked.length ? +(100 * blocked.filter(g => g.p_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const gem = tallyFor('gem', blocked), gpt = tallyFor('gpt', blocked);
  // cross-judge agreement on the decisive T-vs-P consistent winner
  let agree = 0, both = 0;
  for (const g of blocked) { const a = gem.consistentTvP[g.id], b = gpt.consistentTvP[g.id]; if (a && b) { both++; if (a === b) agree++; } }
  const out = { n_tasks: gens.length, n_blocked: blocked.length, block_rate_pct: blockRate, objective_gate_clear: { T_pct: tCleared, P_pct: pCleared }, gemini: gem.tally, codex_TvP: gpt.tally.TvP, cross_judge_TvP_agreement: { both_decided: both, agreed: agree } };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  const wl = (tal, X, Y) => { const t = tal[`${X}v${Y}`]; const dec = t[X] + t[Y]; return `${X} vs ${Y} (n=${t.n}): **${X} ${t[X]} – ${t[Y]} ${Y}**, ties ${t.tie}.${dec ? ` ${X} wins ${+(100 * t[X] / dec).toFixed(0)}% of decided.` : ''}`; };
  const L = ['# fable_check — confirmatory two-judge pairwise re-test\n',
    `${out.n_tasks} tasks; gate fired on **${out.n_blocked}/${out.n_tasks}** (${blockRate}%). Forced-choice pairwise, both orders, order-inconsistent = tie. Judge 1 Gemini-2.5-pro (all pairs); Judge 2 GPT-5.5/codex (decisive T-vs-P only).\n`,
    '## Gemini-2.5-pro (order-consistent wins on blocked tasks)',
    '- ' + wl(gem.tally, 'T', 'C') + '  ← gate-revision vs raw',
    '- ' + wl(gem.tally, 'T', 'P') + '  ← **deterministic gate vs generic second pass**',
    '- ' + wl(gem.tally, 'C', 'P') + '  ← any second pass vs raw',
    '',
    '## GPT-5.5 / codex (cross-provider check, T-vs-P only)',
    '- ' + wl(gpt.tally, 'T', 'P'),
    `- Cross-judge agreement on the T-vs-P consistent winner: **${agree}/${both}** tasks where both judges decided.`,
    '',
    '## Objective check (no judge): revision cleared the gate?',
    `- T (gate-guided) ${tCleared}% · P (generic) ${pCleared}% of blocked tasks.`,
    '',
    '## Which tasks blocked',
    ...blocked.map(g => `- ${g.id} (${g.dod}): ${g.raw_fail_ids.join(', ')}`),
    '',
    'Cluster = task; forced-choice + both-orders removes the score ceiling and controls position bias; two judges across providers test model-robustness. T beating C and P under both judges is the bar for "real, not asking-theater."',
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

export { BATTERY, callGemini, pairPrompt, extractJSON, PAIRS, GEN, JUD, OUT, readJSON };

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phase = process.argv[2] || 'all';
  if (phase === 'gen') await generate();
  else if (phase === 'judge') await judge();
  else if (phase === 'report') report();
  else { await generate(); await judge(); report(); }
}
