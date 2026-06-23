// run-multiturn.mjs — MULTI-TURN developer-productivity A/B. The faithful test of fablever's actual
// mechanism: across an interactive session, does fablever reach a shippable result in FEWER developer
// round-trips than plain Opus? (The one-shot forced-choice in ./out can't capture this — it rewards a
// maximally-complete single artifact, the opposite of restraint. Multi-turn charges plain Opus for the
// round-trips its permission-asks + under-delivery actually cost.)
//
// Per task, per arm, we run a simulated chat to "done":
//   turn 1: assistant answers the task.
//   each turn: a NEUTRAL, IDENTICAL developer-policy reacts to the assistant's latest reply ->
//     - reply ends on a question / permission-ask  -> dev: "use your best judgment, give me the complete
//       final result" (a wasted round-trip the dev didn't want).
//     - reply is incomplete (independent oracle says so) -> dev names the gap and asks for it (rework).
//     - reply is complete AND has no trailing question  -> DONE.
//   capped at CAP assistant turns. Both arms get the SAME policy + SAME oracle; only the style differs.
//
// FAIRNESS: the "complete?" oracle is Gemini (a DIFFERENT model), NOT fablever's own fable_check gate, so
// fablever gets no home-field advantage. Baseline isolation (A0 = plain Opus) proven in ../BASELINE-VALIDATION.md.
// Primary metric: assistant-turns-to-done, paired per task (sign test on A1<A0). Plus resolved-within-cap
// rate and total assistant words the developer had to read across the whole session.
//
// Usage: node run-multiturn.mjs  (run -> report, resumable) | node run-multiturn.mjs run|report

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out2');
const CONV = path.join(OUT, 'conv');
for (const d of [OUT, CONV]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CONC = 4, CAP = 4, GEN_TIMEOUT_MS = 220000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

// battery: developer tasks where multi-turn round-trips actually happen (research/doc heavy; code minimal)
const CRIT = {
  research: ['A clear recommendation/verdict', 'Reasoning a reader could check', 'What would change the answer / the main limitation', 'Concrete enough to act on without a follow-up'],
  'doc-planning': ['Opens with the recommendation/decision', 'An explicit recommendation', 'The key risks/open questions', 'Concrete, actionable next steps'],
  code: ['A correct fix', 'A check/trace backing any "it works" claim', 'Scoped to the bug', 'Explanation matches the code'],
};
const research = [
  'Postgres or MongoDB for an early B2B SaaS primary datastore', 'REST or GraphQL for a mobile app API', 'a monorepo or multiple repos for a 20-engineer startup',
  'server-side or client-side rendering for a content-heavy marketing site', 'REST or gRPC for internal microservices', 'build or buy an auth system for a B2B product',
  'serverless functions or containers for a bursty-traffic API', 'RabbitMQ or Kafka for a moderate-throughput event pipeline',
].map((s, i) => ({ id: `res${i + 1}`, dod: 'research', prompt: `Should we use ${s}? Give me a recommendation and your reasoning.` }));
const doc = [
  'migrating application logging from a self-hosted ELK stack to a managed service', 'whether to rewrite our legacy PHP monolith or refactor it incrementally', 'introducing feature flags into our deployment pipeline',
  'moving CI from Jenkins to GitHub Actions', 'standing up an on-call rotation and incident process', 'adopting TypeScript across our JS codebase', 'migrating user auth to a third-party provider',
].map((s, i) => ({ id: `doc${i + 1}`, dod: 'doc-planning', prompt: `Write a short decision/planning memo on ${s}.` }));
const code = [
  'This should return the LAST index of x in arr but returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.',
  'This debounce drops the final call:\n\nfunction debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(fn, ms); }; }\n\nFix it so the last call runs with its args, and confirm it works.',
  'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.',
].map((p, i) => ({ id: `cod${i + 1}`, dod: 'code', prompt: p }));
const BATTERY = [...research, ...doc, ...code].map(t => ({ ...t, criteria: CRIT[t.dod] }));

function runClaude(prompt, arm) {
  const onFable = arm === 'A1';
  const settings = onFable ? '{"outputStyle":"Fable"}' : '{"outputStyle":"default"}';
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fmt-'); } catch {}
    const done = (txt) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(txt); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', settings], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: onFable ? '' : 'off' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function gen(prompt, arm) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt, arm); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt, keyTest) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 1200, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', keyTest); if (o) return o; } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }
// INDEPENDENT oracle (Gemini, not fablever's gate): is the latest deliverable acceptance-complete for the task?
const acceptPrompt = (task, criteria, deliverable) => `A developer asked an assistant the request below and got the latest reply shown. Judge ONLY whether the reply is a COMPLETE, directly-shippable answer the developer can act on WITHOUT having to ask a follow-up. Be strict but fair: it is complete if it satisfies the checklist and leaves no required piece unanswered. It is NOT complete if it is missing a required element OR if it ends by asking the developer a question / asking permission instead of just delivering.\n\nREQUEST:\n${task}\n\nCHECKLIST (what a complete answer must contain):\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nLATEST REPLY:\n${deliverable}\n\nOutput ONLY this JSON: {"complete": true or false, "missing": "if incomplete, the ONE most important missing piece in <=12 words; else empty"}`;
const TRAIL_Q = /(\?\s*)$/;
const PERMISSION = /\b(should i|shall i|do you want me to|would you like me to|want me to|let me know if you|which (?:would you|do you) (?:prefer|want))\b/i;
function endsOnQuestion(text) { const t = String(text || '').trim(); const tail = t.split('\n').filter(Boolean).slice(-2).join(' '); return TRAIL_Q.test(t) || PERMISSION.test(tail); }
function continuation(task, convo) {
  const lines = convo.map(m => `${m.role === 'dev' ? 'DEVELOPER' : 'ASSISTANT'}: ${m.text}`).join('\n\n');
  return `You are the assistant in an ongoing chat with a developer. Continue the conversation: produce ONLY your next assistant reply (no preamble, no restating the question), addressing the developer's latest message.\n\n=== CONVERSATION SO FAR ===\n${lines}\n\n=== YOUR NEXT REPLY (assistant) ===`;
}

async function runArm(task, arm) {
  const convo = [{ role: 'dev', text: task.prompt }];
  let doneTurn = null;
  for (let turn = 1; turn <= CAP; turn++) {
    const prompt = turn === 1 ? task.prompt : continuation(task, convo);
    const reply = await gen(prompt, arm);
    convo.push({ role: 'asst', text: reply });
    const trailingQ = endsOnQuestion(reply);
    const acc = await callGemini(acceptPrompt(task.prompt, task.criteria, reply || '(empty)'), x => x.complete !== undefined) || { complete: false, missing: 'no oracle response' };
    if (acc.complete && !trailingQ) { doneTurn = turn; break; }
    if (turn < CAP) {
      const devMsg = trailingQ
        ? "Please use your best judgment and just give me the complete, final result — I don't want to go back and forth on this."
        : `It's not done yet — it's missing: ${acc.missing || 'a required piece'}. Please give me the complete version.`;
      convo.push({ role: 'dev', text: devMsg });
    }
  }
  const asstTurns = convo.filter(m => m.role === 'asst').length;
  const asstWords = convo.filter(m => m.role === 'asst').reduce((s, m) => s + words(m.text), 0);
  return { resolved: doneTurn !== null, done_turn: doneTurn, effective_turns: doneTurn ?? (CAP + 1), asst_turns: asstTurns, asst_words: asstWords, convo };
}

async function run() {
  const todo = BATTERY.filter(t => !fs.existsSync(path.join(CONV, t.id + '.json')));
  console.log(`[run] ${BATTERY.length} tasks, ${todo.length} to run (CAP=${CAP} turns)`); let done = 0;
  await pool(todo, CONC, async (task) => {
    const A0 = await runArm(task, 'A0');
    const A1 = await runArm(task, 'A1');
    fs.writeFileSync(path.join(CONV, task.id + '.json'), JSON.stringify({ id: task.id, dod: task.dod, A0: { ...A0 }, A1: { ...A1 } }, null, 2));
    done++; console.log(`[run] ${done}/${todo.length} ${task.id} A0=${A0.effective_turns}t(resolved=${A0.resolved}) A1=${A1.effective_turns}t(resolved=${A1.resolved})`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
const mean = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0;
function report() {
  const rows = BATTERY.map(t => readJSON(path.join(CONV, t.id + '.json'))).filter(Boolean);
  let a1Fewer = 0, a0Fewer = 0, tie = 0;
  for (const r of rows) { const d = r.A1.effective_turns - r.A0.effective_turns; if (d < 0) a1Fewer++; else if (d > 0) a0Fewer++; else tie++; }
  const decided = a1Fewer + a0Fewer;
  const p = decided ? +binomTwoSided(a1Fewer, decided).toFixed(4) : null;
  const ci = wilson(a1Fewer, decided);
  const byDom = {}; for (const r of rows) { (byDom[r.dod] = byDom[r.dod] || { a1Fewer: 0, a0Fewer: 0, tie: 0 }); const d = r.A1.effective_turns - r.A0.effective_turns; if (d < 0) byDom[r.dod].a1Fewer++; else if (d > 0) byDom[r.dod].a0Fewer++; else byDom[r.dod].tie++; }
  const out = {
    n_tasks: rows.length, cap_turns: CAP,
    paired_turns_to_done: { A1_fewer: a1Fewer, A0_fewer: a0Fewer, tie, decided, A1_win_pct_of_decided: decided ? +(100 * a1Fewer / decided).toFixed(1) : null, p_two_sided: p, wilson95: ci },
    mean_turns_to_done: { A0: mean(rows.map(r => r.A0.effective_turns)), A1: mean(rows.map(r => r.A1.effective_turns)) },
    resolved_within_cap_pct: { A0: +(100 * rows.filter(r => r.A0.resolved).length / rows.length).toFixed(1), A1: +(100 * rows.filter(r => r.A1.resolved).length / rows.length).toFixed(1) },
    mean_total_assistant_words: { A0: mean(rows.map(r => r.A0.asst_words)), A1: mean(rows.map(r => r.A1.asst_words)) },
    by_domain: byDom,
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  const P = out.paired_turns_to_done, mt = out.mean_turns_to_done, rv = out.resolved_within_cap_pct, mw = out.mean_total_assistant_words;
  const L = ['# Multi-turn developer-productivity A/B — plain Opus (A0) vs fablever (A1)\n',
    `${out.n_tasks} developer tasks, same base model (${MODEL}), simulated interactive sessions capped at ${CAP} assistant turns. A NEUTRAL, identical developer-policy reacts to each arm; the "complete?" oracle is **Gemini-2.5-pro (a different model), NOT fablever's own gate** (no home-field advantage). Baseline isolation in ../BASELINE-VALIDATION.md. Primary metric: assistant-turns to reach a done deliverable, paired per task (lower = fewer developer round-trips = more productive). Unresolved-within-cap scored as ${CAP + 1} turns.\n`,
    '## Primary — paired turns-to-done (which arm reached a shippable result in FEWER turns)',
    '| metric | value |',
    '|---|---|',
    `| tasks fablever (A1) reached done in fewer turns | **${P.A1_fewer}** |`,
    `| tasks plain Opus (A0) reached done in fewer turns | ${P.A0_fewer} |`,
    `| ties (same #turns) | ${P.tie} |`,
    `| decided | ${P.decided} |`,
    `| A1 win-% of decided | ${P.A1_win_pct_of_decided ?? '–'}% |`,
    `| p (exact two-sided binomial sign test) | ${P.p_two_sided ?? '–'} |`,
    `| 95% CI (Wilson, A1 share of decided) | [${P.wilson95[0]}, ${P.wilson95[1]}]% |`,
    '',
    '## Secondary',
    '| metric | A0 (plain) | A1 (fablever) | direction |',
    '|---|---|---|---|',
    `| mean turns to done | ${mt.A0} | ${mt.A1} | lower = fewer round-trips |`,
    `| resolved within ${CAP} turns | ${rv.A0}% | ${rv.A1}% | higher = reaches done |`,
    `| mean total assistant words read across session | ${mw.A0} | ${mw.A1} | lower = less reading to done |`,
    '',
    `By domain (A1-fewer / A0-fewer / tie): ${Object.entries(byDom).map(([k, v]) => `${k} ${v.a1Fewer}/${v.a0Fewer}/${v.tie}`).join(' · ')}.`,
    '',
    `**Reading:** this is the faithful test of fablever's productivity mechanism — it wins only when it reaches a CORRECT, complete result (per an independent oracle) in fewer developer round-trips. Contrast with the one-shot forced-choice in ../out (where plain Opus's extra scaffolding read as "less work" because a single response can't be charged for the round-trips it would trigger). Cluster = task; one oracle model. Both the one-shot (negative) and this multi-turn result are published — neither is cherry-picked.`,
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'run') await run();
else if (phase === 'report') report();
else { await run(); report(); }
