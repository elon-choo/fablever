// run-check-ab.mjs — placebo-controlled A/B for fable_check (the deterministic delivery gate).
//
// The decision-trail experiment taught the lesson this design is built to honor: an after-the-fact
// artifact that "felt diligent" moved nothing. So here we test whether APPLYING the gate to a finished
// deliverable improves it — and we add a PLACEBO arm that does an equal-effort generic self-review pass,
// so we can separate "the deterministic gate helped" from "any second pass helped."
//
// Per task, all three arms start from ONE raw draft generated under the live Fable style (= what fablever
// users get today):
//   C (control)  = the raw draft, untouched.
//   T (gate)     = if fable_check BLOCKs the raw draft, one revision pass guided by the gate's SPECIFIC
//                  flagged gaps; if it PASSes, T = raw (the gate is selective, not always-revise).
//   P (placebo)  = on the SAME blocked tasks, one revision pass guided only by generic "make it excellent"
//                  self-review (no deterministic gate). On non-blocked tasks P = raw, matching T.
// An independent Gemini judge scores each arm's deliverable 0-100 + accept against HELD-OUT criteria it is
// given but the arms never see (the gate's checklist is a proxy; the judge is the ground truth). Blind to arm.
// Objective secondary metric (no judge): after revision, does T clear the gate? does P incidentally clear it?
//
// Usage: node run-check-ab.mjs            (gen -> judge -> report, resumable)
//        node run-check-ab.mjs gen|judge|report
//
// NOTE: this is a plain Node script (not a Workflow script), so Date.now() is fine here.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const OUT = path.join(HERE, 'out');
const GEN = path.join(OUT, 'gen'), JUD = path.join(OUT, 'judge');
for (const d of [OUT, GEN, JUD]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 2, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 100)); } } })); }

// ---- battery: realistic deliverable prompts that do NOT telegraph the gate's criteria, across 5 domains.
// `criteria` = held-out acceptance points for the judge (holistic quality, not the gate's checklist).
const BATTERY = [
  { id: 'mkt1', dod: 'marketing-copy',
    prompt: 'Write the hero-section copy (2-3 short paragraphs) for the landing page of a new app called "Inbox Zero AI" that auto-summarizes and triages your email. Make it punchy and ready to ship.',
    criteria: ['Has a single, clear primary call to action (not several competing ones)', 'Any numeric/social-proof claim is plausible and not obviously fabricated', 'Opens with a compelling hook that conveys the core benefit', 'Concise and on-tone for a consumer SaaS hero section'] },
  { id: 'mkt2', dod: 'marketing-copy',
    prompt: 'Give me 3 distinct subject-line angles for a re-engagement email to lapsed users of a meditation app, and tell me which one to send.',
    criteria: ['Offers 3 genuinely distinct angles', 'Makes a clear recommendation of which to send', 'Subject lines are concise and curiosity/benefit-driven', 'No fabricated stats presented as fact'] },
  { id: 'fun1', dod: 'funnel-design',
    prompt: 'Our B2B SaaS gets plenty of signups but very few convert to paid. Sketch how you would improve the conversion.',
    criteria: ['Names a specific target metric to move and a timeframe', 'Identifies the single biggest leak/bottleneck rather than listing everything', 'Proposes a concrete first experiment to run', 'Prioritizes rather than giving a flat list of generic tactics'] },
  { id: 'fun2', dod: 'funnel-design',
    prompt: 'Design the activation funnel for a free-to-paid mobile fitness app and tell me where to focus first.',
    criteria: ['States the activation metric and a timeframe', 'Pinpoints the biggest drop-off stage', 'Gives a clearly prioritized first test', 'Is specific to a fitness app, not generic'] },
  { id: 'res1', dod: 'research',
    prompt: 'Should an early B2B SaaS startup build its primary datastore on Postgres or MongoDB? Give me your recommendation and reasoning.',
    criteria: ['Leads with a clear recommendation', 'Backs key claims with reasoning a reader could check (not just assertion)', 'States what would change the answer / the main limitation', 'Balanced — acknowledges the losing option\'s real strengths'] },
  { id: 'res2', dod: 'research',
    prompt: 'Is server-side rendering worth the added complexity for a content-heavy marketing site? Brief me.',
    criteria: ['Leads with a clear verdict', 'Supports claims with checkable reasoning', 'States the conditions under which the verdict flips', 'Distinguishes fact from opinion'] },
  { id: 'doc1', dod: 'doc-planning',
    prompt: 'Draft a short planning memo for migrating our application logging from a self-hosted ELK stack to a managed service.',
    criteria: ['Opens with the recommendation/decision, not background', 'Contains an explicit recommendation', 'Surfaces the key risks/open questions honestly', 'Right length and altitude for a decision memo'] },
  { id: 'doc2', dod: 'doc-planning',
    prompt: 'Write a one-page PRD outline for adding a dark-mode theme to our web app.',
    criteria: ['Leads with the goal/decision', 'Includes problem, scope, and acceptance criteria', 'Flags open questions rather than silently assuming', 'Concrete enough to act on'] },
  { id: 'cod1', dod: 'code',
    prompt: 'This function should return the LAST index of x in arr, but it returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.',
    criteria: ['The fix is correct (iterates from the end, or tracks the last match)', 'Backs the "done" claim with a check, a traced example, or an explicit note of what is unverified', 'Does not over-edit beyond the bug', 'Explanation matches the code'] },
  { id: 'cod2', dod: 'code',
    prompt: 'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.',
    criteria: ['Provides a correct O(n) dedup (e.g. Set-based) preserving order', 'Any performance/speed number is sourced or explicitly marked an estimate, not asserted as measured', 'Preserves original-order semantics', 'Explanation is accurate'] },
];

// ---- MCP client: drive the REAL fable_check from the repo server (taste off, so it can't perturb the gate).
function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, FABLE_TASTE: 'off' } });
  const pending = new Map(); let buf = '', nid = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(r => { const id = nid++; pending.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return {
    init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }),
    check: async (text, dod) => { const r = await rpc('tools/call', { name: 'fable_check', arguments: { text, dod_id: dod } }); return JSON.parse(r.result.content[0].text); },
    close: () => { try { child.stdin.end(); child.kill(); } catch {} },
  };
}

function runClaude(prompt) {
  return new Promise(resolve => {
    let child; try {
      const args = ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'];
      child = spawn(CLAUDE, args, { env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
      child.on('error', () => { clearTimeout(timer); resolve(''); });
    } catch { resolve(''); }
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
    if (blocked) {
      tText = await genClaude(tRevise(task.prompt, raw, fails));
      pText = await genClaude(pRevise(task.prompt, raw));
      tGate = await cli.check(tText, task.dod);
      pGate = await cli.check(pText, task.dod);
    }
    fs.writeFileSync(path.join(GEN, task.id + '.json'), JSON.stringify({
      id: task.id, dod: task.dod, blocked,
      raw_fail_ids: fails.map(f => f.id), raw_gate: gate.gate,
      t_gate: tGate.gate, p_gate: pGate.gate,
      C: raw, T: tText, P: pText,
    }, null, 2));
    console.log(`[gen] ${task.id} blocked=${blocked} fails=[${fails.map(f => f.id).join(',')}] t_gate=${tGate.gate} p_gate=${pGate.gate}`);
  });
  cli.close();
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) { for (let a = 0; a < 4; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 2000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', x => x.score !== undefined); if (o) return o; } catch { await new Promise(z => setTimeout(z, 1500 * (a + 1))); } } return null; }
const judgePrompt = (task, criteria, deliverable) => `You are a demanding reviewer deciding whether to ACCEPT a deliverable as-is or send it back for rework.\n\nTASK GIVEN TO THE WRITER:\n${task}\n\nACCEPTANCE CRITERIA a good deliverable must meet:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nDELIVERABLE:\n---\n${deliverable}\n---\n\nScore 0-100 on how well it meets the criteria and how ready it is to ship without rework. Set accept=true ONLY if you would send it to the requester as-is. Be calibrated: a solid ready deliverable scores 75-90; an excellent one 90+; one with a real gap 40-70; a poor one below 40. Do not reward length or hedging.\n\nOutput ONLY this JSON on the last line: {"score": <0-100>, "accept": <true|false>, "why": "one sentence"}`;

async function judge() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const jobs = [];
  for (const g of gens) { const task = BATTERY.find(t => t.id === g.id); for (const arm of ['C', 'T', 'P']) jobs.push({ id: g.id, arm, task, text: g[arm] || '(empty)' }); }
  const todo = jobs.filter(j => !fs.existsSync(path.join(JUD, `${j.id}__${j.arm}.json`)));
  console.log(`[judge] ${jobs.length} total, ${todo.length} to run`); let done = 0;
  await pool(todo, JUDGE_CONC, async (j) => {
    const v = await callGemini(judgePrompt(j.task.prompt, j.task.criteria, j.text));
    if (v) fs.writeFileSync(path.join(JUD, `${j.id}__${j.arm}.json`), JSON.stringify({ id: j.id, arm: j.arm, score: v.score, accept: !!v.accept, why: v.why }, null, 2));
    done++; console.log(`[judge] ${done}/${todo.length} ${j.id}/${j.arm} ${v ? v.score : 'NULL'}`);
  });
}

const mean = a => a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : null;
const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
function report() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.arm}`] = v; }
  const blocked = gens.filter(g => g.blocked), passed = gens.filter(g => !g.blocked);
  const scoresOn = (set, arm) => set.map(g => J[`${g.id}__${arm}`]).filter(Boolean).map(v => v.score);
  const acceptOn = (set, arm) => { const vs = set.map(g => J[`${g.id}__${arm}`]).filter(Boolean); return pct(vs.filter(v => v.accept).length, vs.length); };

  const blockRate = pct(blocked.length, gens.length);
  const tCleared = pct(blocked.filter(g => g.t_gate === 'PASS').length, blocked.length);
  const pCleared = pct(blocked.filter(g => g.p_gate === 'PASS').length, blocked.length);
  const sC = mean(scoresOn(blocked, 'C')), sT = mean(scoresOn(blocked, 'T')), sP = mean(scoresOn(blocked, 'P'));
  const allC = mean(scoresOn(gens, 'C')), allT = mean(scoresOn(gens, 'T')), allP = mean(scoresOn(gens, 'P'));

  const out = {
    n_tasks: gens.length, block_rate_pct: blockRate, n_blocked: blocked.length, n_passed: passed.length,
    block_fail_ids: blocked.map(g => ({ id: g.id, dod: g.dod, fails: g.raw_fail_ids })),
    objective_gate_clear_after_revision: { T_cleared_pct: tCleared, P_cleared_pct: pCleared },
    judge_on_blocked_tasks: { n: blocked.length, score_C: sC, score_T: sT, score_P: sP, accept_C: acceptOn(blocked, 'C'), accept_T: acceptOn(blocked, 'T'), accept_P: acceptOn(blocked, 'P'), lift_T_minus_C: (sT != null && sC != null) ? +(sT - sC).toFixed(1) : null, lift_T_minus_P: (sT != null && sP != null) ? +(sT - sP).toFixed(1) : null, lift_P_minus_C: (sP != null && sC != null) ? +(sP - sC).toFixed(1) : null },
    judge_all_tasks: { score_C: allC, score_T: allT, score_P: allP },
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));

  const L = ['# fable_check — placebo-controlled A/B (deterministic delivery gate)\n',
    `${out.n_tasks} deliverable tasks across 5 domains, generated under the live Fable style. The gate fired (BLOCK) on **${out.n_blocked}/${out.n_tasks}** (${blockRate}%). Active comparison is on those blocked tasks: **C** = raw draft, **T** = one revision guided by the gate's specific flags, **P** = one generic "make it excellent" revision (placebo, equal effort). Independent Gemini judge, 0-100, blind to arm, scored against held-out criteria the arms never saw.\n`,
    '## Judge scores on the blocked tasks (where the gate actually did something)',
    '| arm | mean score | accept-rate % |',
    '|---|---|---|',
    `| C — raw draft | ${sC} | ${acceptOn(blocked, 'C')} |`,
    `| T — gate-guided revision | ${sT} | ${acceptOn(blocked, 'T')} |`,
    `| P — placebo generic revision | ${sP} | ${acceptOn(blocked, 'P')} |`,
    '',
    `**Lift T−C = ${out.judge_on_blocked_tasks.lift_T_minus_C}** (does the gate improve the deliverable at all)`,
    `**Lift T−P = ${out.judge_on_blocked_tasks.lift_T_minus_P}** (does the deterministic gate beat a generic second pass — the real question)`,
    `**Lift P−C = ${out.judge_on_blocked_tasks.lift_P_minus_C}** (does any second pass help)`,
    '',
    '## Objective check (no judge): did the revision clear the gate?',
    `- T (gate-guided): cleared on ${tCleared}% of blocked tasks`,
    `- P (generic): incidentally cleared on ${pCleared}% of blocked tasks`,
    '',
    '## Which tasks the gate blocked, and on what',
    ...blocked.map(g => `- ${g.id} (${g.dod}): ${g.raw_fail_ids.join(', ')}`),
    '',
    `## All-tasks mean (incl. ${out.n_passed} the gate passed, where C=T=P)`,
    `C ${allC} · T ${allT} · P ${allP}`,
    '',
    'Small-N pilot (cluster = task); directional, not powered for significance. The placebo arm is the guard the decision-trail study lacked: if T ≈ P, the value is "revise once more," not the gate mechanism; if T > P, the deterministic gate adds real signal a generic pass misses; if T ≈ C, the gate is inert.',
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'gen') await generate();
else if (phase === 'judge') await judge();
else if (phase === 'report') report();
else { await generate(); await judge(); report(); }
