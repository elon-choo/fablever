// run-mega.mjs — large-scale, statistically-powered re-test of fable_check.
//
// out2 (7 blocked) and out3 (12 blocked) found T-vs-C robust and T-vs-P a tie, with one judge. This scales to
// ~60 tasks weighted to the gate's wheelhouse (research/funnel/doc) for ~40+ blocked tasks, so the two key
// comparisons get real power: exact two-sided binomial sign test + Wilson 95% CI on the win proportion.
//   Arms: C raw Fable draft; T = one revision guided by the gate's specific flags (BLOCKed tasks only);
//   P = one generic "make it excellent" revision (placebo). Judge: Gemini-2.5-pro, forced-choice pairwise,
//   both presentation orders (order-inconsistent = position bias = tie). Cross-model already shown in out3.
//
// Usage: node run-mega.mjs  (gen -> judge -> report, resumable) | node run-mega.mjs gen|judge|report

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const OUT = path.join(HERE, 'out4');
const GEN = path.join(OUT, 'gen'), JUD = path.join(OUT, 'judge');
for (const d of [OUT, GEN, JUD]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 4, GEM_CONC = 5, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// --- templated battery: prompt varies, criteria fixed per domain (domain-level quality bars) ---
const CRIT = {
  research: ['Leads with a clear recommendation/verdict', 'Backs key claims with reasoning a reader could check, not bare assertion', 'States what would change the answer / the main limitation', "Fairly weighs the rejected option's real strengths"],
  'funnel-design': ['Names a specific target metric and a timeframe', 'Singles out the single biggest leak/bottleneck, not a flat list', 'Proposes a concrete, prioritized first experiment', 'Specific to the scenario, not generic boilerplate'],
  'doc-planning': ['Opens with the recommendation/decision, not background', 'Contains an explicit recommendation', 'Surfaces the key risks/open questions honestly', 'Right altitude for a decision memo, concrete enough to act on'],
  'marketing-copy': ['One clear primary CTA, not several competing', 'No obviously fabricated stats/testimonials', 'Leads with the strongest benefit/hook', 'Tight, on-tone, ready to ship'],
  code: ['The fix is correct', 'Backs any done/works/speed claim with a check, traced example, benchmark, or explicit unverified note', 'Stays scoped to the bug, no over-edit', 'Explanation matches the code'],
};
const research = [
  'Postgres or MongoDB for an early B2B SaaS primary datastore', 'REST or GraphQL for a mobile app API', 'a monorepo or multiple repos for a 20-engineer startup',
  'server-side or client-side rendering for a content-heavy marketing site', 'REST or gRPC for communication between internal microservices', 'Kubernetes or simpler hosting for a 3-service backend',
  'a SQL or NoSQL store for an event-logging system', 'build or buy an auth system for a B2B product', 'Tailwind or CSS-in-JS for a new React app',
  'Redux or React Context for state in a mid-size app', 'serverless functions or containers for a bursty-traffic API', 'RabbitMQ or Kafka for a moderate-throughput event pipeline',
  'Postgres or DynamoDB for a high-write IoT ingestion service', 'Next.js or a plain React SPA for a SaaS dashboard', 'Python or Go for a new data-processing backend',
  'webhooks or polling for a third-party integration', 'JWTs or server-side sessions for web app auth', 'Elasticsearch or Postgres full-text search for moderate search needs',
  'microservices or a modular monolith for a Series-A startup', 'self-hosted or managed Postgres for a 5-person team',
].map((s, i) => ({ id: `res${i + 1}`, dod: 'research', prompt: `Should we use ${s}? Give me a recommendation and your reasoning.` }));
const funnel = [
  'Our B2B SaaS gets plenty of signups but very few convert to paid.', 'A free-to-paid mobile fitness app has weak activation.', 'Our e-commerce store has high cart-abandonment.',
  'Our mobile app has good installs but poor day-7 retention.', 'A note-taking SaaS has low free-to-paid upgrades.', 'Our online course platform gets traffic but low enrollment.',
  'We book many B2B demos but few close.', 'Our newsletter has high open rate but low click-through to the product.', 'Marketplace buyers browse but rarely complete a first purchase.',
  'A freemium API product gets signups but low activation to first API call.', 'Our SaaS trial has many starts but low trial-to-paid.', 'A mobile game has strong installs but weak day-1 retention.',
  'Our subscription box has high checkout-starts but low completion.', 'Users sign up but never reach the onboarding "aha" moment.', 'Our webinar has high registration but low attendance.',
].map((s, i) => ({ id: `fun${i + 1}`, dod: 'funnel-design', prompt: `${s} Sketch how you would improve it and tell me where to focus first.` }));
const doc = [
  'migrating application logging from a self-hosted ELK stack to a managed service', 'adding a dark-mode theme to our web app', 'whether to build or buy our internal analytics dashboard',
  'whether to rewrite our legacy PHP monolith or refactor it incrementally', 'introducing feature flags into our deployment pipeline', 'adopting a shared design system across product teams',
  'moving CI from Jenkins to GitHub Actions', 'introducing a versioned public API', 'standing up an on-call rotation and incident process',
  'consolidating three internal tools into one platform', 'adopting TypeScript across our JS codebase', 'migrating user auth to a third-party provider',
  'establishing a data-retention and deletion policy', 'sunsetting a legacy feature that still has active users', 'standardizing the team code-review process',
].map((s, i) => ({ id: `doc${i + 1}`, dod: 'doc-planning', prompt: `Write a short decision/planning memo on ${s}.` }));
const mkt = [
  'Write the hero-section copy (2-3 short paragraphs) for the landing page of "Inbox Zero AI", an app that auto-summarizes and triages email. Make it ready to ship.',
  'Give me 3 distinct subject-line angles for a re-engagement email to lapsed meditation-app users, and tell me which to send.',
  'Write a short App Store description (first 3 lines matter most) for a habit-tracking app for busy professionals.',
  'Write the landing-page hero copy for a freelance-invoicing tool aimed at solo consultants. Ready to ship.',
  'Give me 3 ad angles for a meal-prep delivery service targeting busy parents, and tell me which to run.',
].map((p, i) => ({ id: `mkt${i + 1}`, dod: 'marketing-copy', prompt: p }));
const code = [
  'This should return the LAST index of x in arr but returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.',
  'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.',
  'This pagination helper returns duplicates across pages when rows are inserted between requests:\n\nfunction page(items, offset, limit){ return items.slice(offset, offset + limit); }\n\nExplain the fix and confirm it works.',
  'Speed up this prime check and tell me how much faster it is:\n\nfunction isPrime(n){ for (let i = 2; i < n; i++) if (n % i === 0) return false; return n > 1; }',
  'This debounce drops the final call:\n\nfunction debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(fn, ms); }; }\n\nFix it so the last call runs with its args, and confirm it works.',
].map((p, i) => ({ id: `cod${i + 1}`, dod: 'code', prompt: p }));
const BATTERY = [...research, ...funnel, ...doc, ...mkt, ...code].map(t => ({ ...t, criteria: CRIT[t.dod] }));

function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, FABLE_TASTE: 'off' } });
  const pending = new Map(); let buf = '', nid = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(r => { const id = nid++; pending.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }), check: async (text, dod) => { const r = await rpc('tools/call', { name: 'fable_check', arguments: { text, dod_id: dod } }); return JSON.parse(r.result.content[0].text); }, close: () => { try { child.stdin.end(); child.kill(); } catch {} } };
}
function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fcmg-'); } catch {}
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
  console.log(`[gen] ${BATTERY.length} tasks, ${todo.length} to run`); let done = 0;
  await pool(todo, GEN_CONC, async (task) => {
    const raw = await genClaude(task.prompt);
    const gate = await cli.check(raw, task.dod);
    const blocked = gate.gate === 'BLOCK';
    const fails = (gate.items || []).filter(i => i.status === 'FAIL');
    let tText = raw, pText = raw, tGate = gate, pGate = gate;
    if (blocked) { tText = await genClaude(tRevise(task.prompt, raw, fails)); pText = await genClaude(pRevise(task.prompt, raw)); tGate = await cli.check(tText, task.dod); pGate = await cli.check(pText, task.dod); }
    fs.writeFileSync(path.join(GEN, task.id + '.json'), JSON.stringify({ id: task.id, dod: task.dod, blocked, raw_fail_ids: fails.map(f => f.id), t_gate: tGate.gate, p_gate: pGate.gate, C: raw, T: tText, P: pText }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${task.id} blocked=${blocked} [${fails.map(f => f.id).join(',')}] tG=${tGate.gate} pG=${pGate.gate}`);
  });
  cli.close();
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', x => x.winner !== undefined); if (o) return o; } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }
const pairPrompt = (task, criteria, A, B) => `You are a demanding senior reviewer comparing two deliverables produced for the SAME task. Pick the ONE you would actually ship. You MUST choose A or B — ties are not allowed.\n\nBe hard to please. Reward specificity, a decisive and well-supported recommendation, explicitly naming what would change the answer, and tight writing. Penalize generic advice that could apply to any company, hedging, unsupported claims, burying the main point, and padding. Small differences decide it.\n\nTASK:\n${task}\n\nWHAT A GOOD DELIVERABLE MUST DO:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n=== DELIVERABLE A ===\n${A}\n\n=== DELIVERABLE B ===\n${B}\n\nOutput ONLY this JSON on the last line: {"winner":"A or B","why":"one sentence on the deciding difference"}`;

const PAIRS = [['T', 'C'], ['T', 'P'], ['C', 'P']];
async function judge() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean).filter(g => g.blocked);
  const jobs = [];
  for (const g of gens) { const task = BATTERY.find(t => t.id === g.id); for (const [X, Y] of PAIRS) { jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o1', A: X, B: Y, Atext: g[X], Btext: g[Y], task }); jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o2', A: Y, B: X, Atext: g[Y], Btext: g[X], task }); } }
  const file = j => path.join(JUD, `${j.id}__${j.pair}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[judge] ${gens.length} blocked tasks, ${jobs.length} calls, ${todo.length} to run`); let done = 0;
  await pool(todo, GEM_CONC, async (j) => {
    const v = await callGemini(pairPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)'));
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, pair: j.pair, order: j.order, winnerArm: w === 'A' ? j.A : j.B }, null, 2)); }
    done++; if (done % 20 === 0) console.log(`[judge] ${done}/${todo.length}`);
  });
  console.log('[judge] done');
}

// exact two-sided binomial sign test (p0=0.5) + Wilson 95% CI
function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
function report() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const blocked = gens.filter(g => g.blocked);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  const tally = {}; for (const [X, Y] of PAIRS) tally[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0, n: 0 };
  for (const g of blocked) for (const [X, Y] of PAIRS) { const o1 = J[`${g.id}__${X}v${Y}__o1`], o2 = J[`${g.id}__${X}v${Y}__o2`]; if (!o1 || !o2) continue; const t = tally[`${X}v${Y}`]; t.n++; if (o1.winnerArm === o2.winnerArm) t[o1.winnerArm]++; else t.tie++; }
  const byDom = {}; for (const g of blocked) { byDom[g.dod] = (byDom[g.dod] || 0) + 1; }
  const tCleared = blocked.length ? +(100 * blocked.filter(g => g.t_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const pCleared = blocked.length ? +(100 * blocked.filter(g => g.p_gate === 'PASS').length / blocked.length).toFixed(1) : null;
  const stat = (X, Y) => { const t = tally[`${X}v${Y}`]; const dec = t[X] + t[Y]; const p = binomTwoSided(t[X], dec); const ci = wilson(t[X], dec); return { wins_X: t[X], wins_Y: t[Y], ties: t.tie, decided: dec, X_win_pct: dec ? +(100 * t[X] / dec).toFixed(1) : null, p_two_sided: p == null ? null : +p.toFixed(4), wilson95: ci }; };
  const out = { n_tasks: gens.length, n_blocked: blocked.length, block_rate_pct: +(100 * blocked.length / gens.length).toFixed(1), blocked_by_domain: byDom, objective_gate_clear: { T_pct: tCleared, P_pct: pCleared }, TvC: stat('T', 'C'), TvP: stat('T', 'P'), CvP: stat('C', 'P') };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  const row = (name, s, note) => `| ${name} | ${s.wins_X}–${s.wins_Y} (ties ${s.ties}) | ${s.decided} | ${s.X_win_pct}% | ${s.p_two_sided} | [${s.wilson95[0]}, ${s.wilson95[1]}]% | ${note} |`;
  const L = ['# fable_check — large-scale powered re-test\n',
    `${out.n_tasks} tasks; gate fired on **${out.n_blocked}/${out.n_tasks}** (${out.block_rate_pct}%). Blocked by domain: ${Object.entries(byDom).map(([k, v]) => `${k} ${v}`).join(', ')}. Forced-choice pairwise (Gemini-2.5-pro), both orders, order-inconsistent = tie. Win-% is of decided (non-tie) pairs; p = exact two-sided binomial sign test vs 50/50; CI = Wilson 95% on the leading arm's share of decided.\n`,
    '| comparison | wins | decided n | win-% | p (two-sided) | 95% CI | meaning |',
    '|---|---|---|---|---|---|---|',
    row('T vs C', out.TvC, 'gate-fixed vs raw draft'),
    row('T vs P', out.TvP, 'deterministic gate vs generic 2nd pass'),
    row('C vs P', out.CvP, 'raw vs any 2nd pass'),
    '',
    `**Objective (no judge):** gate-guided revision T cleared the gate on **${tCleared}%** of blocked tasks; generic P on **${pCleared}%**.`,
    '',
    'Cluster = task; one judge (cross-model agreement already shown in out3). The code domain rarely blocks (Fable already grounds code claims), so the gate concentrates value in research/funnel/doc. Reading: a low p on T-vs-C with CI well above 50% = the gate reliably beats shipping the raw draft; a high p on T-vs-P with CI spanning 50% = no detectable quality edge over a generic second pass (the gate\'s edge is the deterministic structural guarantee, not a higher ceiling).',
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'gen') await generate();
else if (phase === 'judge') await judge();
else if (phase === 'report') report();
else { await generate(); await judge(); report(); }
