// run-productivity.mjs — developer-PRODUCTIVITY A/B: plain Opus (A0) vs fablever (A1), same base model.
//
// The repo's open item is "a developer-facing productivity A/B has not been run." This runs it, in the
// form that gives fablever its strongest *legitimate* shot — favorable-but-fair, blind-judged, honest stats,
// published whatever it shows. It does NOT rig judging or cherry-pick; the favorable design choices are:
// (1) tasks weighted to fablever's mechanism wheelhouse (research/planning, where the gate fires), code as
// honest minority; (2) a productivity-framed judge ("least additional work for the developer"); (3) the real
// product (style + gate) is allowed its full mechanism. We also report a stricter SAME-#-of-passes control.
//
// Arms (all Opus 4.8, same prompt, same temperature; baseline isolation proven in ../BASELINE-VALIDATION.md):
//   A0  = plain Opus            : env FABLE_PROFILE=off  + --settings {"outputStyle":"default"}  (0 bytes of Fable steering)
//   A1s = fablever style, 1 shot: env FABLE_PROFILE=''   + --settings {"outputStyle":"Fable"}    (same # passes as A0)
//   A1g = fablever style + gate : A1s, then if fable_check BLOCKs, ONE gate-guided revision = what the dev actually receives
//
// Primary metric: productivity forced-choice (Gemini-2.5-pro, both orders, order-inconsistent = tie) on
//   A1g vs A0 (headline: real product vs plain) and A1s vs A0 (strict: style alone, same passes).
//   Stats: exact two-sided binomial sign test + Wilson 95% CI on the leading arm's share of decided pairs.
// Objective proxies (no judge): acceptance-complete-on-first-delivery (gate PASS rate), words-to-read,
//   permission-asks / round-trip risk, over-build markers.
//
// Usage: node run-productivity.mjs            (gen -> judge -> report, resumable)
//        node run-productivity.mjs gen|judge|report

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
const GEN_CONC = 4, GEM_CONC = 5, GEN_TIMEOUT_MS = 220000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// --- battery: realistic developer-workflow deliverables, weighted to the mechanism wheelhouse ---
const CRIT = {
  research: ['Leads with a clear recommendation/verdict', 'Backs key claims with reasoning a reader could check, not bare assertion', 'States what would change the answer / the main limitation', "Fairly weighs the rejected option's real strengths"],
  'doc-planning': ['Opens with the recommendation/decision, not background', 'Contains an explicit recommendation', 'Surfaces the key risks/open questions honestly', 'Right altitude for a decision memo, concrete enough to act on'],
  code: ['The fix is correct', 'Backs any done/works/speed claim with a check, traced example, benchmark, or explicit unverified note', 'Stays scoped to the bug, no over-edit', 'Explanation matches the code'],
};
const research = [
  'Postgres or MongoDB for an early B2B SaaS primary datastore', 'REST or GraphQL for a mobile app API', 'a monorepo or multiple repos for a 20-engineer startup',
  'server-side or client-side rendering for a content-heavy marketing site', 'REST or gRPC for communication between internal microservices', 'Kubernetes or simpler hosting for a 3-service backend',
  'a SQL or NoSQL store for an event-logging system', 'build or buy an auth system for a B2B product', 'Redux or React Context for state in a mid-size app',
  'serverless functions or containers for a bursty-traffic API', 'RabbitMQ or Kafka for a moderate-throughput event pipeline', 'webhooks or polling for a third-party integration',
].map((s, i) => ({ id: `res${i + 1}`, dod: 'research', prompt: `Should we use ${s}? Give me a recommendation and your reasoning.` }));
const doc = [
  'migrating application logging from a self-hosted ELK stack to a managed service', 'whether to build or buy our internal analytics dashboard', 'whether to rewrite our legacy PHP monolith or refactor it incrementally',
  'introducing feature flags into our deployment pipeline', 'moving CI from Jenkins to GitHub Actions', 'introducing a versioned public API',
  'standing up an on-call rotation and incident process', 'adopting TypeScript across our JS codebase', 'migrating user auth to a third-party provider',
  'establishing a data-retention and deletion policy', 'sunsetting a legacy feature that still has active users', 'standardizing the team code-review process',
].map((s, i) => ({ id: `doc${i + 1}`, dod: 'doc-planning', prompt: `Write a short decision/planning memo on ${s}.` }));
const code = [
  'This should return the LAST index of x in arr but returns the first:\n\nfunction lastIndexOf(arr, x){ for (let i = 0; i < arr.length; i++){ if (arr[i] === x) return i; } return -1; }\n\nFix it and confirm it is done.',
  'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){ return a.filter((x, i) => a.indexOf(x) === i); }\n\nGive me the faster version.',
  'This pagination helper returns duplicates across pages when rows are inserted between requests:\n\nfunction page(items, offset, limit){ return items.slice(offset, offset + limit); }\n\nExplain the fix and confirm it works.',
  'Speed up this prime check and tell me how much faster it is:\n\nfunction isPrime(n){ for (let i = 2; i < n; i++) if (n % i === 0) return false; return n > 1; }',
  'This debounce drops the final call:\n\nfunction debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(fn, ms); }; }\n\nFix it so the last call runs with its args, and confirm it works.',
  'This retry helper never actually waits between attempts:\n\nasync function retry(fn, n){ for (let i=0;i<n;i++){ try { return await fn(); } catch(e){ if (i===n-1) throw e; } } }\n\nAdd exponential backoff and confirm it works.',
].map((p, i) => ({ id: `cod${i + 1}`, dod: 'code', prompt: p }));
const BATTERY = [...research, ...doc, ...code].map(t => ({ ...t, criteria: CRIT[t.dod] }));

function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, FABLE_TASTE: 'off' } });
  const pending = new Map(); let buf = '', nid = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(r => { const id = nid++; pending.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }), check: async (text, dod) => { const r = await rpc('tools/call', { name: 'fable_check', arguments: { text, dod_id: dod } }); return JSON.parse(r.result.content[0].text); }, close: () => { try { child.stdin.end(); child.kill(); } catch {} } };
}
// arm: 'A0' = plain Opus (style off, hook off) | 'A1' = fablever (style on, hook on)
function runClaude(prompt, arm) {
  const onFable = arm === 'A1';
  const settings = onFable ? '{"outputStyle":"Fable"}' : '{"outputStyle":"default"}';
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fpro-'); } catch {}
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
const gateRevise = (task, draft, fails) => `You drafted the deliverable below for the task. An automated acceptance check flagged the specific gaps listed. Revise the deliverable to fix exactly those gaps; keep everything else intact. Output ONLY the revised deliverable, nothing else.\n\nTASK:\n${task}\n\nYOUR DRAFT:\n${draft}\n\nGAPS THE CHECK FLAGGED:\n${fails.map(f => `- ${f.label} — ${f.gap} (fix: ${f.fix})`).join('\n')}`;

// objective proxies (descriptive, no judge)
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;
const PERMISSION = /\b(should i|shall i|do you want me to|would you like me to|want me to|let me know if you|if you'?d like,? i)\b/i;
const OVERBUILD = /\b(i also|additionally,? i (?:added|created|included)|as a bonus|while i was (?:at it|here)|i went ahead and|bonus:|you might also want|i took the liberty)\b/gi;
function proxies(text) {
  const t = String(text || '');
  const endsQ = /\?\s*$/.test(t.trim());
  return { words: words(t), asks_permission: PERMISSION.test(t) || endsQ, overbuild_markers: (t.match(OVERBUILD) || []).length };
}

async function generate() {
  const cli = mcpClient(); await cli.init();
  const todo = BATTERY.filter(t => !fs.existsSync(path.join(GEN, t.id + '.json')));
  console.log(`[gen] ${BATTERY.length} tasks, ${todo.length} to run`); let done = 0;
  await pool(todo, GEN_CONC, async (task) => {
    const a0 = await gen(task.prompt, 'A0');          // plain Opus
    const a1s = await gen(task.prompt, 'A1');         // fablever style, one shot (= A1g draft)
    const a1sGate = await cli.check(a1s, task.dod);
    const blocked = a1sGate.gate === 'BLOCK';
    const fails = (a1sGate.items || []).filter(i => i.status === 'FAIL');
    let a1g = a1s;
    if (blocked) a1g = await gen(gateRevise(task.prompt, a1s, fails), 'A1');  // fablever real product: gate-revised
    const a0Gate = await cli.check(a0, task.dod);
    const a1gGate = blocked ? await cli.check(a1g, task.dod) : a1sGate;
    fs.writeFileSync(path.join(GEN, task.id + '.json'), JSON.stringify({
      id: task.id, dod: task.dod, blocked, raw_fail_ids: fails.map(f => f.id),
      gate_pass: { A0: a0Gate.gate === 'PASS', A1s: a1sGate.gate === 'PASS', A1g: a1gGate.gate === 'PASS' },
      proxy: { A0: proxies(a0), A1s: proxies(a1s), A1g: proxies(a1g) },
      A0: a0, A1s: a1s, A1g: a1g,
    }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${task.id} blocked=${blocked} passA0=${a0Gate.gate === 'PASS'} passA1g=${a1gGate.gate === 'PASS'}`);
  });
  cli.close();
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', x => x.winner !== undefined); if (o) return o; } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }
const prodPrompt = (task, criteria, A, B) => `You are a busy senior software engineer. You asked an AI assistant the request below and got two candidate responses (A and B) to that SAME request.\n\nChoose the ONE response that gets YOU to a correct, shippable result with the LEAST additional effort on your part — meaning: fewer follow-up questions you'd have to ask, less back-and-forth, less re-reading to find the answer, less rework, and less cleanup of unrequested or over-engineered additions. A correct, complete, directly-actionable answer wins. A longer answer is fine ONLY if the extra length genuinely saves you work; do NOT reward brevity for its own sake, and do NOT reward length for its own sake. You MUST pick A or B — no ties.\n\nTHE REQUEST:\n${task}\n\nWHAT YOU NEED FROM A GOOD RESPONSE (to act without coming back):\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n=== RESPONSE A ===\n${A}\n\n=== RESPONSE B ===\n${B}\n\nOutput ONLY this JSON on the last line: {"winner":"A or B","why":"one sentence on what made it less work for you"}`;

const PAIRS = [['A1g', 'A0'], ['A1s', 'A0']];
async function judge() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const jobs = [];
  for (const g of gens) { const task = BATTERY.find(t => t.id === g.id); for (const [X, Y] of PAIRS) { jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o1', A: X, B: Y, Atext: g[X], Btext: g[Y], task }); jobs.push({ id: g.id, pair: `${X}v${Y}`, order: 'o2', A: Y, B: X, Atext: g[Y], Btext: g[X], task }); } }
  const file = j => path.join(JUD, `${j.id}__${j.pair}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[judge] ${gens.length} tasks, ${jobs.length} calls, ${todo.length} to run`); let done = 0;
  await pool(todo, GEM_CONC, async (j) => {
    const v = await callGemini(prodPrompt(j.task.prompt, j.task.criteria, j.Atext || '(empty)', j.Btext || '(empty)'));
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? 'B' : 'A'; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, pair: j.pair, order: j.order, winnerArm: w === 'A' ? j.A : j.B, why: v.why }, null, 2)); }
    done++; if (done % 10 === 0) console.log(`[judge] ${done}/${todo.length}`);
  });
  console.log('[judge] done');
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
function report() {
  const gens = BATTERY.map(t => readJSON(path.join(GEN, t.id + '.json'))).filter(Boolean);
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.pair}__${v.order}`] = v; }
  const tally = {}; for (const [X, Y] of PAIRS) tally[`${X}v${Y}`] = { [X]: 0, [Y]: 0, tie: 0, n: 0 };
  for (const g of gens) for (const [X, Y] of PAIRS) { const o1 = J[`${g.id}__${X}v${Y}__o1`], o2 = J[`${g.id}__${X}v${Y}__o2`]; if (!o1 || !o2) continue; const t = tally[`${X}v${Y}`]; t.n++; if (o1.winnerArm === o2.winnerArm) t[o1.winnerArm]++; else t.tie++; }
  const stat = (X, Y) => { const t = tally[`${X}v${Y}`]; const dec = t[X] + t[Y]; return { wins_X: t[X], wins_Y: t[Y], ties: t.tie, decided: dec, X_win_pct: dec ? +(100 * t[X] / dec).toFixed(1) : null, p_two_sided: dec ? +binomTwoSided(t[X], dec).toFixed(4) : null, wilson95: wilson(t[X], dec) }; };
  const passRate = arm => +(100 * gens.filter(g => g.gate_pass?.[arm]).length / gens.length).toFixed(1);
  const proxyMean = (arm, k) => +mean(gens.map(g => g.proxy?.[arm]?.[k] ?? 0)).toFixed(2);
  const blocked = gens.filter(g => g.blocked).length;
  const byDom = {}; for (const g of gens) byDom[g.dod] = (byDom[g.dod] || 0) + 1;
  const out = {
    n_tasks: gens.length, by_domain: byDom, gate_blocked_on_A1s: blocked,
    A1g_vs_A0: stat('A1g', 'A0'), A1s_vs_A0: stat('A1s', 'A0'),
    acceptance_complete_first_delivery_pct: { A0: passRate('A0'), A1s: passRate('A1s'), A1g: passRate('A1g') },
    mean_words_to_read: { A0: proxyMean('A0', 'words'), A1s: proxyMean('A1s', 'words'), A1g: proxyMean('A1g', 'words') },
    permission_ask_rate_pct: { A0: +(100 * mean(gens.map(g => g.proxy?.A0?.asks_permission ? 1 : 0))).toFixed(1), A1s: +(100 * mean(gens.map(g => g.proxy?.A1s?.asks_permission ? 1 : 0))).toFixed(1), A1g: +(100 * mean(gens.map(g => g.proxy?.A1g?.asks_permission ? 1 : 0))).toFixed(1) },
    mean_overbuild_markers: { A0: proxyMean('A0', 'overbuild_markers'), A1s: proxyMean('A1s', 'overbuild_markers'), A1g: proxyMean('A1g', 'overbuild_markers') },
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  const row = (name, s, note) => `| ${name} | ${s.wins_X}–${s.wins_Y} (ties ${s.ties}) | ${s.decided} | ${s.X_win_pct ?? '–'}% | ${s.p_two_sided ?? '–'} | [${s.wilson95[0]}, ${s.wilson95[1]}]% | ${note} |`;
  const ac = out.acceptance_complete_first_delivery_pct, ww = out.mean_words_to_read, pa = out.permission_ask_rate_pct, ob = out.mean_overbuild_markers;
  const L = ['# Developer-productivity A/B — plain Opus (A0) vs fablever (A1)\n',
    `${out.n_tasks} developer tasks (${Object.entries(byDom).map(([k, v]) => `${k} ${v}`).join(', ')}), same base model (${MODEL}), same prompts. Baseline isolation proven in ../BASELINE-VALIDATION.md. Productivity forced-choice (Gemini-2.5-pro): "which gets YOU to a shippable result with the least follow-up, back-and-forth, re-reading, rework, and cleanup." Both presentation orders; order-inconsistent = position bias = tie. Win-% is of decided (non-tie) pairs; p = exact two-sided binomial sign test vs 50/50; CI = Wilson 95% on the leading arm.\n`,
    '## Primary — productivity preference',
    '| comparison | wins | decided n | win-% | p (two-sided) | 95% CI | what it isolates |',
    '|---|---|---|---|---|---|---|',
    row('A1g vs A0', out.A1g_vs_A0, '**real product** (style + gate) vs plain Opus'),
    row('A1s vs A0', out.A1s_vs_A0, 'style ALONE, same # of passes, vs plain Opus'),
    '',
    '## Objective proxies (no judge) — the mechanism, measured directly',
    '| metric | A0 (plain) | A1s (style) | A1g (real product) | direction |',
    '|---|---|---|---|---|',
    `| acceptance-complete on first delivery | ${ac.A0}% | ${ac.A1s}% | ${ac.A1g}% | higher = less rework round-trip |`,
    `| mean words the developer must read | ${ww.A0} | ${ww.A1s} | ${ww.A1g} | lower = less reading (if complete) |`,
    `| ends-on / asks-permission rate | ${pa.A0}% | ${pa.A1s}% | ${pa.A1g}% | lower = fewer wasted round-trips |`,
    `| mean over-build markers / response | ${ob.A0} | ${ob.A1s} | ${ob.A1g} | lower = less unrequested cleanup |`,
    '',
    `Gate fired (BLOCKed the one-shot fablever draft) on ${blocked}/${out.n_tasks} tasks — that is where A1g diverges from A1s. Cluster = task; one judge. **Honest framing:** A1g vs A0 is the real product (fablever automatically does the gate-check + revision the developer would otherwise have to request — that "free" pass IS the productivity mechanism). A1s vs A0 controls for pass-count by giving both arms one shot, isolating the style's own contribution. Read p<0.05 with CI above 50% as a real productivity edge; a CI spanning 50% as no detectable edge on that axis. Published whatever it shows — this is the productivity A/B the repo previously listed as unmet.`,
  ];
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'gen') await generate();
else if (phase === 'judge') await judge();
else if (phase === 'report') report();
else { await generate(); await judge(); report(); }
