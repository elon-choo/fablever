// run-autoseed.mjs — Closes the one gap the local-seed A/B (run-local-seed.mjs) flagged as untested.
// local-seed PROVED that a HAND-WRITTEN convention file lifts adherence (no-seed 11% → local-seed 78% >>
// generic-nudge 22%), but it handed the model a hand-authored convention; it could not test whether an
// AUTO-GENERATED seed — produced by reading the module's existing code — carries the convention as well.
// That auto-generation is exactly what an `/init-deep`-style feature would ship. This A/B tests it:
//
//   Arm A (no seed)     = task alone (model defaults).            [reference]
//   Arm B (hand seed)   = task + the hand-written convention.     [the known-good ceiling, ~78%]
//   Arm D (auto seed)   = a GENERATOR (claude) reads an example of the module's existing code and writes a
//                         short AGENTS.md; that AUTO-generated file is then prepended to the task.
//
// If D ≈ B >> A, auto-generation preserves the hand-written seed's lift → the auto-seed feature is validated.
// If D << B, auto-generation loses fidelity → the feature needs more than a naive generator.
// The task-runner NEVER sees the example code — only the generated AGENTS.md — so D isolates the generator's
// fidelity, not leakage. Adherence judged by GPT-5.5 (codex) oracle + a transparent regex, same as local-seed.
// Usage: node run-autoseed.mjs [gen|grade|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'as-raw'), GRD = path.join(HERE, 'as-grade');
for (const d of [RAW, GRD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'claude-opus-4-8', GMODEL = 'gpt-5.5';
const GEN_CONC = 3, JUDGE_CONC = 3, GEN_TIMEOUT_MS = 200000, JUDGE_TIMEOUT_MS = 180000, BATCH = 6;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// Same 9 conventions/prompts/regexes as run-local-seed.mjs (for direct comparability), PLUS an `example` —
// existing module code that EXHIBITS the convention, which only the generator reads.
const TASKS = [
  { id: 'money', conv: 'Money is always represented as integer cents (never floating-point dollars). Functions that deal with money take and return integer cents.', prompt: 'Add a function `addPrices(a, b)` to the payments module that adds two prices and returns the total.', adhere: /cent|\* ?100|integer/i, violate: /parseFloat|\btoFixed\(2\)|dollars? as (?:a )?float/i,
    example: `// payments.js (existing)\nexport function subtractPrices(a, b) { return a - b; } // a, b are integer cents\nexport function applyTax(cents) { return cents + Math.round(cents * 0.1); }\nexport function formatPrice(cents) { return \`$\${(cents / 100).toFixed(2)}\`; }` },
  { id: 'errors', conv: 'Functions never throw for expected failures. They return a Result: `{ ok: true, value }` or `{ ok: false, error }`.', prompt: 'Add a function `parseAge(s)` to the validation module that parses a user-supplied age string.', adhere: /\bok:\s*(true|false)|return\s*\{\s*ok|Result</i, violate: /\bthrow\s+new\b/i,
    example: `// validation.js (existing)\nexport function parseEmail(s) {\n  if (!s.includes('@')) return { ok: false, error: 'invalid email' };\n  return { ok: true, value: s.toLowerCase() };\n}` },
  { id: 'dates', conv: 'All timestamps are stored and returned as UTC ISO-8601 strings (e.g. via Date.toISOString()).', prompt: 'Add a function `stamp()` to the core module that returns the current timestamp for storage.', adhere: /toISOString|ISO[- ]?8601|UTC/i, violate: /toLocaleString|getTime\(\)\s*$|Date\.now\(\)\s*;?\s*$/i,
    example: `// core.js (existing)\nexport function createdAt() { return new Date().toISOString(); }\nexport function expiry(days) { return new Date(Date.now() + days * 864e5).toISOString(); }` },
  { id: 'sql', conv: 'All SQL uses parameterized queries (placeholders + a params array). String concatenation into SQL is forbidden.', prompt: 'Add a function `findUserByEmail(email)` to the users repository that queries the DB.', adhere: /\$\d|\?\s*[,)]|params\s*[:=]|parameteri/i, violate: /["'`]\s*\+\s*email|\$\{email\}/i,
    example: `// users.repo.js (existing)\nexport function findById(id) { return db.query('SELECT * FROM users WHERE id = $1', [id]); }\nexport function countActive() { return db.query('SELECT count(*) FROM users WHERE active = $1', [true]); }` },
  { id: 'logging', conv: 'Use the structured logger: `logger.info({ event, ...fields })`. console.log is forbidden in app code.', prompt: 'Add an info log to `createOrder(order)` recording that an order was created.', adhere: /logger\.(info|warn|error)\s*\(\s*\{/i, violate: /console\.log/i,
    example: `// orders.js (existing)\nexport function cancelOrder(order) { logger.info({ event: 'order_cancelled', orderId: order.id }); }` },
  { id: 'exports', conv: 'Use named exports only. Default exports are forbidden in this codebase.', prompt: 'Create a `formatName(first, last)` utility in the strings module and export it.', adhere: /export\s+(const|function|class)\s+formatName|export\s*\{\s*formatName/i, violate: /export\s+default/i,
    example: `// strings.js (existing)\nexport function trimName(s) { return s.trim(); }\nexport function slugify(s) { return s.toLowerCase().replace(/\\s+/g, '-'); }` },
  { id: 'http', conv: 'HTTP handlers return a typed object `{ status, body }`; they never call res.send/res.json directly (a wrapper does that).', prompt: 'Add a handler `getHealth(req)` to the http module that reports service health.', adhere: /return\s*\{\s*status|:\s*\{\s*status\s*:/i, violate: /res\.(send|json|end)\s*\(/i,
    example: `// http.js (existing)\nexport function getVersion(req) { return { status: 200, body: { version: '1.2.0' } }; }` },
  { id: 'ids', conv: 'New entity IDs are ULIDs generated by `newId()`. Never use auto-increment or Math.random for IDs.', prompt: 'Add a function `createSession(userId)` to the auth module that makes a new session record.', adhere: /newId\(\)|ulid/i, violate: /autoincrement|Math\.random|\+\+\s*id|serial/i,
    example: `// auth.js (existing)\nexport function createUser(name) { return { id: newId(), name }; } // newId() returns a ULID` },
  { id: 'validation', conv: 'Validate all external input at the boundary with the `schema` validator (schema.parse(input)) before use.', prompt: 'Add a function `handleSignup(input)` to the api module that processes a signup payload.', adhere: /schema\.parse|\.parse\(input|validate\(/i, violate: null,
    example: `// api.js (existing)\nexport function handleLogin(input) { const data = schema.parse(input); return doLogin(data); }` },
].map(t => ({ ...t }));

const seedBlock = conv => `\n\nThis module has a local AGENTS.md you must follow:\n--- AGENTS.md ---\n${conv}\n--- end ---`;
const genSeedPrompt = ex => `You are generating a local AGENTS.md for a module, the way an init tool would. Read the EXISTING module code below and write a SHORT AGENTS.md (max 4 bullet lines) that states the coding conventions evident in it, so a new contributor matches the style. State the rules as rules, do not restate the code. Output ONLY the AGENTS.md contents.\n\nEXISTING CODE:\n${ex}`;

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-as-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', '{"outputStyle":"Fable"}'], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function genC(prompt) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }
async function gen() {
  const todo = TASKS.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${todo.length} tasks: generate AGENTS.md, then A/B/D`); let done = 0;
  await pool(todo, GEN_CONC, async (t) => {
    const autoConv = await genC(genSeedPrompt(t.example));           // the auto-generated AGENTS.md
    const A = await genC(t.prompt);                                  // no seed
    const B = await genC(t.prompt + seedBlock(t.conv));              // hand-written seed
    const D = autoConv ? await genC(t.prompt + seedBlock(autoConv)) : ''; // auto-generated seed
    fs.writeFileSync(path.join(RAW, t.id + '.json'), JSON.stringify({ id: t.id, conv: t.conv, autoConv, A, B, D }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${t.id} autoConv=${autoConv.length} A=${A.length} B=${B.length} D=${D.length}`);
  });
}

const regexAdhere = (t, text) => { const s = String(text || ''); const must = t.adhere ? t.adhere.test(s) : true; const bad = t.violate ? t.violate.test(s) : false; return must && !bad ? 1 : 0; };

function extractJSON(s, kt) { const str = String(s || ''); let d = 0, st = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (d === 0) st = i; d++; } else if (c === '}') { d--; if (d === 0 && st >= 0) { try { const o = JSON.parse(str.slice(st, i + 1)); if (o && kt(o)) last = o; } catch {} } } } return last; }
function gradeBatchPrompt(items) {
  const blocks = items.map((j, i) => `=== ITEM ${i + 1} ===\nCONVENTION: ${j.conv}\nCODE/REPLY:\n${j.text || '(empty)'}`).join('\n\n');
  return `For each item below, decide STRICTLY whether the CODE/REPLY follows the stated CONVENTION. "follows" = true only if it actually obeys the rule (not merely mentions it). ${items.length} items.\n\n${blocks}\n\nOutput ONLY one line of JSON: {"results":[{"n":1,"follows":true|false}, ...]} with one entry per item.`;
}
function runCodexBatch(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = ''; try { cwd = fs.mkdtempSync('/tmp/as-judge-'); outFile = path.join(cwd, 'o.txt'); } catch {}
    const done = (v) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(v); };
    let child; try {
      child = spawn(CODEX, ['exec', '-m', GMODEL, '--sandbox', 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, prompt], { cwd });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, JUDGE_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); let txt = ''; try { txt = fs.readFileSync(outFile, 'utf8'); } catch {} done(extractJSON(txt || out, x => Array.isArray(x.results))); });
      child.on('error', () => { clearTimeout(timer); done(null); });
    } catch { done(null); }
  });
}
async function gradeBatch(items) { for (let a = 0; a < 3; a++) { const v = await runCodexBatch(gradeBatchPrompt(items)); if (v && Array.isArray(v.results) && v.results.length >= Math.ceil(items.length / 2)) return v.results; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return null; }
async function grade() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(Boolean);
  const jobs = [];
  for (const r of raws) { const t = TASKS.find(x => x.id === r.id); for (const arm of ['A', 'B', 'D']) jobs.push({ id: r.id, arm, conv: t.conv, text: r[arm] }); }
  const file = j => path.join(GRD, `${j.id}__${j.arm}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`[grade] ${todo.length} adherence checks in ${batches.length} batches (${GMODEL})`); let done = 0;
  await pool(batches, JUDGE_CONC, async (batch) => {
    const v = await gradeBatch(batch);
    if (v) for (const x of v) { const j = batch[(x.n || 0) - 1]; if (!j) continue; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, arm: j.arm, follows: !!x.follows }, null, 2)); }
    done += batch.length; console.log(`[grade] ~${done}/${todo.length}`);
  });
}

const pct = (xs, f) => xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : 0;
function report() {
  const raws = TASKS.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(Boolean);
  const G = {}; for (const f of fs.readdirSync(GRD)) { const g = readJSON(path.join(GRD, f)); if (g) G[`${g.id}__${g.arm}`] = g.follows; }
  const armRegex = arm => pct(raws, r => regexAdhere(TASKS.find(t => t.id === r.id), r[arm]) === 1);
  const armOracle = arm => { const xs = raws.filter(r => G[`${r.id}__${arm}`] !== undefined); return pct(xs, r => G[`${r.id}__${arm}`] === true); };
  const out = { n: raws.length, adherence_oracle_gpt5_5_pct: { A_none: armOracle('A'), B_hand_seed: armOracle('B'), D_auto_seed: armOracle('D') }, adherence_regex_pct: { A_none: armRegex('A'), B_hand_seed: armRegex('B'), D_auto_seed: armRegex('D') }, mean_autoConv_words: Math.round(raws.reduce((s, r) => s + (String(r.autoConv || '').match(/\S+/g) || []).length, 0) / Math.max(raws.length, 1)) };
  fs.writeFileSync(path.join(HERE, 'results-autoseed.json'), JSON.stringify(out, null, 2));
  const o = out.adherence_oracle_gpt5_5_pct, rg = out.adherence_regex_pct;
  const preserved = o.B_hand_seed ? Math.round(100 * o.D_auto_seed / o.B_hand_seed) : 0;
  const verdict = (o.D_auto_seed >= 0.8 * o.B_hand_seed && o.D_auto_seed > o.A_none) ? 'ADOPT — auto-generation preserves the lift' : (o.D_auto_seed > o.A_none ? 'PARTIAL — auto helps but loses fidelity vs hand-written' : 'NEGATIVE — naive auto-generation does not carry the convention');
  const L = ['# Technique A/B — AUTO-GENERATED local seed (closes the local-seed auto-discovery gap)\n',
    `local-seed proved a HAND-WRITTEN convention file lifts adherence but couldn't test AUTO-generation — what an \`/init-deep\`-style feature would actually ship. Here a generator (claude) reads an example of the module's existing code and writes the AGENTS.md; the task-runner sees only that generated file. Arm A = no seed; B = hand seed (known ceiling); D = auto seed. Adherence by **GPT-5.5 (codex)** oracle + regex. n=${out.n}.\n`,
    '| adherence | A: no seed | B: hand seed | D: AUTO seed |',
    '|---|---|---|---|',
    `| GPT-5.5 oracle | ${o.A_none}% | ${o.B_hand_seed}% | ${o.D_auto_seed}% |`,
    `| regex check | ${rg.A_none}% | ${rg.B_hand_seed}% | ${rg.D_auto_seed}% |`,
    '',
    `Mean auto-generated AGENTS.md length: ${out.mean_autoConv_words} words.`,
    '',
    `## Observed verdict — ${verdict}`,
    `Auto-generated seed (D) reached **${o.D_auto_seed}%** vs the hand-written ceiling **${o.B_hand_seed}%** (D preserves **${preserved}%** of B's level) and the no-seed baseline **${o.A_none}%**. ${o.D_auto_seed >= 0.8 * o.B_hand_seed ? '**A naive generator that reads existing code carries the convention nearly as well as a hand-authored file** — so the auto-seed feature is viable; the value local-seed measured is reachable automatically.' : 'Auto-generation **loses fidelity** vs the hand-written file — a shippable generator needs more than a one-shot read.'} Independent GPT-5.5 oracle; deterministic regex alongside (${rg.A_none}/${rg.B_hand_seed}/${rg.D_auto_seed}%). This converts the local-seed result toward a *feature*, not just an observation.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS-autoseed.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const m = process.argv[2];
if (m === 'gen') await gen();
else if (m === 'grade') await grade();
else if (m === 'report') report();
else { await gen(); await grade(); report(); }
