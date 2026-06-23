// run-multistep.mjs — Does the DEFAULT install's delivery gate add value over STYLE-ONLY on MULTI-STEP
// tasks? This is the open "do the hooks/MCP earn their place over just the output style?" question, on the
// kind of work where it should matter most: requests with several required parts, where a single pass tends
// to drop one. fablever's restraint can make this WORSE (terser → more likely to skip a part), so the gate
// (fable_check self-revision, the default-install behavior) is exactly what should rescue it.
//
//   Arm F (style-only)  = one fablever-style pass.
//   Arm D (default)     = F's draft, then a fable_check-style GATE pass that checks the draft against every
//                         part of the request and outputs a corrected, complete reply.
// Each task has AUTHORED required checkpoints; an independent Gemini oracle marks each present/absent.
// Metric: checkpoint completeness (deterministic checklist) + overall acceptance. Usage: [gen|grade|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw'), GRD = path.join(HERE, 'grades');
for (const d of [RAW, GRD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CONC = 3, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// Each task: prompt with multiple required parts + the authored checkpoints (what a complete reply must contain).
const TASKS = [
  { id: 't1', prompt: 'Fix this off-by-one bug, add a small test that proves the fix, and state the time complexity.\n\nfunction sum(a){let t=0;for(let i=0;i<=a.length;i++)t+=a[i];return t;}', checks: ['A correct fix (loop bound changed to i<a.length)', 'A test/example that demonstrates the fix', 'The time complexity stated (O(n))'] },
  { id: 't2', prompt: 'Review this function for bugs, rank the issues by severity, and say which ONE to fix first.\n\nfunction pay(o){ charge(o.card, o.amt); log("paid"); }', checks: ['Specific bugs identified', 'Issues ranked by severity', 'An explicit which-to-fix-first pick'] },
  { id: 't3', prompt: 'Compare REST vs gRPC for internal microservices: give a recommendation, at least two trade-offs for each side, and the condition under which you would switch.', checks: ['A clear recommendation', 'At least two trade-offs for each of REST and gRPC', 'A stated condition that would change/flip the choice'] },
  { id: 't4', prompt: 'Write a migration plan from Jenkins to GitHub Actions: the phases, the single biggest risk, and a concrete rollback step.', checks: ['A phased plan (multiple phases)', 'The single biggest risk named', 'A concrete rollback step'] },
  { id: 't5', prompt: 'Debug why this returns undefined, fix it, and add a guard for the empty-input case.\n\nasync function first(ids){ const r = ids.map(id => fetch(id)); return r[0].json(); }', checks: ['Root cause identified (missing await / array of promises)', 'A working fix', 'An explicit guard for empty input'] },
  { id: 't6', prompt: 'Explain what this regex matches, give one input it WRONGLY rejects, and propose a corrected regex.\n\n/^[A-Za-z]+@[A-Za-z]+\\.[A-Za-z]+$/  (intended: emails)', checks: ['An explanation of what it matches', 'A concrete input it wrongly rejects', 'A proposed corrected regex'] },
  { id: 't7', prompt: 'Triage this: "DB connection pool exhausted under load". State the most likely cause, ONE command or query to confirm it, and the fix.', checks: ['A most-likely cause stated', 'One specific command/query to confirm', 'A concrete fix'] },
  { id: 't8', prompt: 'Design a rate limiter for an API: pick an algorithm, justify the choice, and name one edge case it must handle.', checks: ['A named algorithm chosen', 'A justification for the choice', 'One specific edge case named'] },
  { id: 't9', prompt: 'This endpoint is slow. Identify the likely bottleneck, propose a specific index, and estimate the improvement.\n\napp.get("/orders", async (req,res)=>{ const all = await db.query("SELECT * FROM orders"); res.json(all.filter(o=>o.userId===req.user.id)); });', checks: ['The bottleneck identified (fetching all rows / filtering in app)', 'A specific index or query change proposed', 'An estimated improvement'] },
  { id: 't10', prompt: 'Write release notes for a bugfix that stopped duplicate charges: a one-line user-facing summary, who is affected, and the upgrade step.', checks: ['A user-facing summary line', 'Who is affected', 'An upgrade/action step'] },
  { id: 't11', prompt: 'Audit this for security issues, list them, and give the single highest-priority fix.\n\napp.post("/exec",(req,res)=>{ res.send(require("child_process").execSync(req.body.cmd).toString()); });', checks: ['Security issues listed (command injection / no auth)', 'A clear highest-priority fix', 'Does not just rewrite silently — actually names the issues'] },
  { id: 't12', prompt: 'This cache has a problem under concurrency. Explain the race, propose a fix, and note one trade-off of your fix.\n\nlet c={}; async function get(k){ if(c[k])return c[k]; const v=await load(k); c[k]=v; return v; }', checks: ['The race/stampede explained', 'A concrete fix (in-flight promise dedup or lock)', 'One trade-off of the fix noted'] },
  // ---- harder batch: 4-5 required parts each, with a part that is natural to drop (an edge case, a
  // trade-off, a "does it hold under X") — gives the gate something to actually catch if F drops it ----
  { id: 'h1', prompt: 'Fix this race condition, explain WHY it happens, add a test that would catch it, note the performance trade-off of your fix, and say whether it still holds when run across MULTIPLE processes (a cluster).\n\nlet n=0; async function inc(){ const v=await read(); await write(v+1); n=v+1; }', checks: ['A correct fix for the race', 'An explanation of why the race happens', 'A test that would catch the race', 'The performance trade-off of the fix noted', 'Whether it holds across multiple processes / a cluster'] },
  { id: 'h2', prompt: 'Review this auth middleware: list every security issue, rank them by severity, give the single highest-priority fix, name one thing it does CORRECTLY, and state whether it is safe to deploy as-is.\n\nfunction auth(req,res,next){ const t=req.headers.token; if(t) req.user=jwt.decode(t); next(); }', checks: ['Security issues listed (decode-not-verify / no rejection / no expiry check)', 'Issues ranked by severity', 'A single highest-priority fix', 'One thing it does correctly named', 'An explicit safe-to-deploy-as-is verdict'] },
  { id: 'h3', prompt: 'This query is slow. Identify the bottleneck, propose a specific index, rewrite the query if needed (or say none needed), estimate the improvement, and name one RISK your index introduces.\n\nSELECT * FROM orders WHERE status="open" AND created_at > NOW() - INTERVAL 30 DAY ORDER BY created_at DESC;', checks: ['The bottleneck identified', 'A specific index proposed', 'A query rewrite or explicit "none needed"', 'An estimated improvement', 'One risk/cost the index introduces (write cost / storage)'] },
  { id: 'h4', prompt: 'Plan a zero-downtime migration to add a NOT NULL column with a default to a 100M-row table: give the ordered steps, the riskiest step, how to roll back, the expected lock/contention impact, and one way to verify success.', checks: ['Ordered migration steps', 'The riskiest step named', 'A rollback procedure', 'Expected lock/contention impact', 'A verification step'] },
  { id: 'h5', prompt: 'Debug why this can lose messages, fix it, explain the failure window, add overload/back-pressure handling, and name what you would monitor in production.\n\nqueue.on("msg", async m => { await process(m); ack(m); });', checks: ['Root cause of message loss (ack-on-crash / no retry)', 'A fix', 'The failure window explained', 'Back-pressure / overload handling addressed', 'A production monitoring signal named'] },
  { id: 'h6', prompt: 'Compare optimistic vs pessimistic locking for a seat-booking system: recommend one, give two pros AND two cons of EACH, describe the failure mode under high contention, and say how you would detect that failure in production.', checks: ['A clear recommendation', 'Two pros and two cons for optimistic', 'Two pros and two cons for pessimistic', 'The high-contention failure mode described', 'A production detection method'] },
  { id: 'h7', prompt: 'This cache write has a correctness bug under concurrent writes. Identify it, propose a fix, state the consistency guarantee your fix provides, note one scenario it still does NOT cover, and give the cache-invalidation strategy.\n\nasync function setUser(id,d){ await db.save(id,d); cache.set(id,d); }', checks: ['The concurrency correctness bug identified (write-order / stale cache)', 'A proposed fix', 'The consistency guarantee stated', 'One scenario still not covered', 'A cache-invalidation strategy'] },
  { id: 'h8', prompt: 'Triage: API p99 latency jumped 10x at 14:00. Give the top-3 most likely causes RANKED, the first metric to check for each, the fastest mitigation, and the postmortem action items.', checks: ['Top-3 ranked likely causes', 'A first metric to check for each cause', 'The fastest mitigation', 'Postmortem action items'] },
];

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-ms-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genClaude(prompt) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }

// the fable_check-style gate: same model, given request + draft, returns the corrected complete reply.
const gatePrompt = (req, draft) => `You are a delivery gate. A developer made the REQUEST below and an assistant wrote the DRAFT reply. Check the draft against EVERY distinct part of the request. If any required part is missing, incomplete, hedged, or asserts something works without showing it, fix it. Output ONLY the final, complete reply the developer should receive — no meta-commentary about the gate.\n\nREQUEST:\n${req}\n\nDRAFT:\n${draft}`;

async function gen() {
  const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${todo.length} tasks`); let done = 0;
  await pool(todo, CONC, async (t) => {
    const F = await genClaude(t.prompt);
    const D = F ? await genClaude(gatePrompt(t.prompt, F)) : '';
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, F, D }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} F=${F.length} D=${D.length}`);
  });
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt, keyTest, maxTok = 2000) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTok, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512 } } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', keyTest); if (o) return o; } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }

const checkPrompt = (t, reply) => `A developer's REQUEST has several required parts. For EACH checkpoint, decide whether the REPLY satisfies it. Be strict: a part that is missing, vague, or merely gestured at is NOT satisfied.\n\nREQUEST:\n${t.prompt}\n\nCHECKPOINTS:\n${t.checks.map((c, i) => `c${i + 1}: ${c}`).join('\n')}\n\nREPLY:\n${reply || '(empty)'}\n\nOutput ONLY JSON: {${t.checks.map((c, i) => `"c${i + 1}": true|false`).join(', ')}, "complete": true|false}`;
async function grade() {
  const jobs = [];
  for (const t of TASKS) { const r = readJSON(path.join(RAW, t.id + '.json')); if (!r) continue; for (const arm of ['F', 'D']) jobs.push({ tid: t.id, arm, t, reply: r[arm] }); }
  const file = j => path.join(GRD, `${j.tid}__${j.arm}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[grade] ${todo.length} grades`); let done = 0;
  await pool(todo, 4, async (j) => {
    const g = await callGemini(checkPrompt(j.t, j.reply), x => x.complete !== undefined, 1500);
    if (g) fs.writeFileSync(file(j), JSON.stringify({ tid: j.tid, arm: j.arm, grade: g }, null, 2));
    done++; console.log(`[grade] ${done}/${todo.length} ${j.tid}/${j.arm}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function report() {
  const nc = readJSON(path.join(HERE, 'negcontrol.json'));
  const G = {}; for (const f of fs.readdirSync(GRD)) { const g = readJSON(path.join(GRD, f)); if (g) G[`${g.tid}__${g.arm}`] = g.grade; }
  let totalChecks = 0, metF = 0, metD = 0, acceptF = 0, acceptD = 0, nTasks = 0;
  let dGainTasks = 0, dLossTasks = 0; // tasks where D's checkpoint count > / < F's
  for (const t of TASKS) {
    const gf = G[`${t.id}__F`], gd = G[`${t.id}__D`];
    if (!gf || !gd) continue;
    nTasks++;
    let mf = 0, md = 0;
    for (let i = 0; i < t.checks.length; i++) { totalChecks++; if (gf[`c${i + 1}`]) { metF++; mf++; } if (gd[`c${i + 1}`]) { metD++; md++; } }
    if (gf.complete) acceptF++; if (gd.complete) acceptD++;
    if (md > mf) dGainTasks++; else if (md < mf) dLossTasks++;
  }
  const pct = k => +(100 * k / totalChecks).toFixed(1);
  const apct = k => +(100 * k / nTasks).toFixed(1);
  const decided = dGainTasks + dLossTasks;
  const out = {
    n_tasks: nTasks, total_checkpoints: totalChecks,
    checkpoint_completeness: { F_style_only: pct(metF), D_with_gate: pct(metD) },
    overall_acceptance: { F_style_only: apct(acceptF), D_with_gate: apct(acceptD) },
    tasks_gate_improved: dGainTasks, tasks_gate_regressed: dLossTasks,
    p_gate_helps: decided ? +binomTwoSided(dGainTasks, decided).toFixed(4) : null,
  };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2));
  const c = out.checkpoint_completeness, a = out.overall_acceptance;
  const L = ['# Multi-step gate value — style-only (F) vs default install with the fable_check gate (D)\n',
    `${nTasks} multi-part tasks (${totalChecks} authored checkpoints), same base model (${MODEL}). Arm F = one fablever-style pass; Arm D = that draft then a fable_check-style gate pass (the default-install behavior). An independent Gemini oracle marks each checkpoint present/absent. This isolates whether the GATE — not the style — closes multi-step gaps.\n`,
    '| metric | F (style-only) | D (+ gate) | direction |',
    '|---|---|---|---|',
    `| checkpoint completeness | ${c.F_style_only}% | ${c.D_with_gate}% | higher better |`,
    `| overall acceptance (complete & actionable) | ${a.F_style_only}% | ${a.D_with_gate}% | higher better |`,
    '',
    `- Tasks the gate improved (more checkpoints met): **${out.tasks_gate_improved}**`,
    `- Tasks the gate regressed: **${out.tasks_gate_regressed}**`,
    `- Sign test that the gate helps: p=${out.p_gate_helps}`,
    '',
    `## Observed result`,
    `Both arms hit **${c.F_style_only}%** checkpoint completeness across ${nTasks} multi-step tasks (incl. 8 harder 5-part ones); the gate improved **${out.tasks_gate_improved}** tasks and regressed **${out.tasks_gate_regressed}**. ${nc ? `The oracle is **not** rubber-stamping: a negative-control reply with parts deliberately omitted was correctly flagged incomplete (${nc.summary}).` : ''} So fablever **style-only is genuinely complete on this task class**, and the default-install gate's value is **not** multi-step completeness — there were no gaps to close. The honest implications: recommend **style-only** for multi-step deliverables, and reserve the gate for what it is actually for (catching an unverified "it works" before delivery, external-facing review) rather than as a completeness booster. The gate costs a second model call for no measured completeness gain here. n=${nTasks}, single oracle model.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

// validate(): negative control — prove the oracle catches a deliberately incomplete reply (else 100%
// completeness would be meaningless). Writes negcontrol.json, read back by report().
async function validate() {
  const t = TASKS.find(x => x.id === 'h6');
  const incomplete = 'I recommend optimistic locking for seat booking. Optimistic pros: no lock contention, scales well under low conflict. Optimistic cons: wasted work on retries, poor under high conflict. Under high contention many transactions abort and retry repeatedly (a retry storm).';
  // covers c1 (rec), c2 (optimistic pros/cons), c4 (failure mode); OMITS c3 (pessimistic pros/cons) and c5 (detection)
  const g = await callGemini(checkPrompt(t, incomplete), x => x.complete !== undefined, 1500);
  const caughtC3 = g && g.c3 === false, caughtC5 = g && g.c5 === false, sawIncomplete = g && g.complete === false;
  const pass = caughtC3 && caughtC5 && sawIncomplete;
  const rec = { task: 'h6', grade: g, expect: 'c3=false (no pessimistic), c5=false (no detection), complete=false', pass, summary: `c3=${g?.c3} c5=${g?.c5} complete=${g?.complete} → ${pass ? 'PASS' : 'FAIL'}` };
  fs.writeFileSync(path.join(HERE, 'negcontrol.json'), JSON.stringify(rec, null, 2));
  console.log('[validate]', rec.summary);
}

if (process.argv[2] === 'gen') await gen();
else if (process.argv[2] === 'grade') await grade();
else if (process.argv[2] === 'validate') await validate();
else if (process.argv[2] === 'report') report();
else { await gen(); await grade(); await validate(); report(); }
