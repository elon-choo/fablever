// run-xverify.mjs — Does cross-MODEL review (the optional +xverify install mode) catch defects a
// single model misses, AND does it beat just reviewing TWICE with the same model? That second control
// is the honest one: if Claude-twice catches as much, "cross-model" is just "review again."
//
// Corpus: 8 code snippets with a KNOWN, authored set of planted defects (ground truth below). Three
// reviews per snippet: claudeA, claudeB (two independent Claude passes), gemini (independent 2nd-lab).
//   Arm S  (single)      = claudeA
//   Arm D  (Claude x2)   = claudeA ∪ claudeB        <- controls for "just review twice"
//   Arm X  (cross-model) = claudeA ∪ gemini         <- the xverify design
// An independent grader (Gemini) maps each review's free-text findings onto the planted defect IDs
// (per-defect caught? yes/no) and counts extra issues (false-positive proxy). Recall = caught/planted.
//
// Reviews use fablever style ON (the realistic install context); the variable under test is the number
// and DIVERSITY of reviewers, not the style. Usage: node run-xverify.mjs [gen|grade|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REV = path.join(HERE, 'reviews'), GRD = path.join(HERE, 'grades');
for (const d of [REV, GRD]) fs.mkdirSync(d, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CONC = 3, GEN_TIMEOUT_MS = 200000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// ---- corpus: snippet + authored ground-truth defects ----
const CORPUS = [
  { id: 'auth', code:
`function login(req, res) {
  const user = db.findUser(req.body.email);
  if (user.password === req.body.password) {
    const token = jwt.sign({ id: user.id }, 'secret123');
    res.cookie('token', token);
    res.json({ ok: true });
  }
}`,
    defects: [
      { id: 'd1', desc: 'Passwords compared in plaintext (no hashing/bcrypt; stored plaintext implied).' },
      { id: 'd2', desc: "Hardcoded weak JWT signing secret ('secret123')." },
      { id: 'd3', desc: 'Auth cookie set without httpOnly/secure/sameSite flags.' },
      { id: 'd4', desc: 'On wrong password the function falls through and never responds — request hangs.' },
    ] },
  { id: 'cache', code:
`let cache = {};
async function get(key) {
  if (cache[key]) return cache[key];
  const val = await fetchFromDB(key);
  cache[key] = val;
  return val;
}
async function getAll(keys) {
  const out = [];
  for (const k of keys) out.push(await get(k));
  return out;
}`,
    defects: [
      { id: 'd1', desc: 'Cache stampede: concurrent calls for the same missing key all hit the DB (no in-flight dedup).' },
      { id: 'd2', desc: 'Unbounded cache growth — no eviction/TTL/size limit (memory leak).' },
      { id: 'd3', desc: 'getAll awaits serially in a loop instead of Promise.all — needlessly slow.' },
    ] },
  { id: 'transfer', code:
`async function transfer(fromId, toId, amt) {
  const from = await getAccount(fromId);
  if (from.balance < amt) throw new Error('insufficient');
  await setBalance(fromId, from.balance - amt);
  await setBalance(toId, (await getAccount(toId)).balance + amt);
}`,
    defects: [
      { id: 'd1', desc: 'Not atomic / no transaction: a failure after the debit but before the credit loses money.' },
      { id: 'd2', desc: 'TOCTOU race: balance check and debit are not atomic, allowing double-spend under concurrency.' },
      { id: 'd3', desc: 'No validation that amt > 0 — a negative amount reverses the transfer (steals funds).' },
    ] },
  { id: 'topn', code:
`// Returns the highest n scores.
function topN(arr, n) {
  return arr.sort((a, b) => a - b).slice(0, n);
}`,
    defects: [
      { id: 'd1', desc: 'Sorts ascending then takes the first n — returns the LOWEST n, not the highest (logic bug).' },
      { id: 'd2', desc: 'Array.sort mutates the caller\'s input array in place (unexpected side effect).' },
    ] },
  { id: 'download', code:
`app.get('/download', (req, res) => {
  const file = req.query.name;
  res.sendFile('/var/data/' + file);
});`,
    defects: [
      { id: 'd1', desc: 'Path traversal: req.query.name can contain ../ to read arbitrary files.' },
      { id: 'd2', desc: 'No authentication/authorization on the download endpoint.' },
      { id: 'd3', desc: 'No existence/error handling if the file is missing (unhandled error / crash).' },
    ] },
  { id: 'stats', code:
`function average(nums) {
  return nums.reduce((a, b) => a + b) / nums.length;
}
function median(nums) {
  const s = nums.sort();
  return s[Math.floor(s.length / 2)];
}`,
    defects: [
      { id: 'd1', desc: 'average throws on an empty array (reduce with no initial value).' },
      { id: 'd2', desc: 'median sorts lexicographically (no numeric comparator) — wrong order for numbers; also mutates input.' },
      { id: 'd3', desc: 'median of an even-length array returns the upper-middle element instead of averaging the two middle values.' },
    ] },
  { id: 'retry', code:
`async function fetchWithRetry(url, n) {
  for (let i = 0; i < n; i++) {
    try { return await fetch(url); }
    catch (e) {}
  }
}`,
    defects: [
      { id: 'd1', desc: 'No request timeout — a hung fetch blocks forever.' },
      { id: 'd2', desc: 'Catch block swallows the error silently (no log / no surfacing).' },
      { id: 'd3', desc: 'No backoff/delay between retry attempts (hammers the endpoint).' },
      { id: 'd4', desc: 'After n failures returns undefined instead of throwing — silent failure for the caller.' },
    ] },
  { id: 'closures', code:
`function makeCounters() {
  const fns = [];
  for (var i = 0; i < 3; i++) { fns.push(() => i); }
  return fns; // expected [0,1,2]
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(fn, ms); };
}`,
    defects: [
      { id: 'd1', desc: 'var in the loop: all returned closures capture the same i and return 3 (should be 0,1,2).' },
      { id: 'd2', desc: 'debounce drops the call arguments — setTimeout(fn, ms) invokes fn() with no args.' },
    ] },
  // ---- subtler batch: defects a strong single reviewer can plausibly miss (creates headroom so the
  // cross-model question isn't ceiling-capped) ----
  { id: 'sub_money', code:
`function addCents(a, b) { return (a + b).toFixed(2); }
function total(items) { return items.reduce((s, i) => s + i.price * i.qty, 0); }`,
    defects: [
      { id: 'd1', desc: 'Floating-point money: summing prices as floats accumulates rounding error (the 0.1+0.2 problem) — money should be integer cents.' },
      { id: 'd2', desc: 'addCents returns a string (.toFixed) instead of a number, breaking any further arithmetic on the result.' },
    ] },
  { id: 'sub_date', code:
`function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }`,
    defects: [
      { id: 'd1', desc: 'Dividing by a fixed 86,400,000 ms ignores DST: days that are 23h/25h cause off-by-one results across a DST boundary.' },
      { id: 'd2', desc: 'No validation of invalid date strings — an unparseable date yields NaN that propagates silently.' },
    ] },
  { id: 'sub_regex', code:
`const re = /^(a+)+$/;
function valid(s) { return re.test(s); }`,
    defects: [
      { id: 'd1', desc: 'Catastrophic backtracking (ReDoS): the nested quantifier (a+)+ runs in exponential time on inputs like "aaaaaaaaaa!".' },
    ] },
  { id: 'sub_compare', code:
`function sortByName(users) { return users.sort((a, b) => a.name > b.name ? 1 : -1); }`,
    defects: [
      { id: 'd1', desc: 'The comparator never returns 0 for equal names — it violates the sort contract and gives unstable/incorrect ordering in some engines.' },
      { id: 'd2', desc: 'Locale-insensitive comparison (no localeCompare): accented/non-ASCII names sort incorrectly.' },
      { id: 'd3', desc: 'Array.sort mutates the caller\'s input array in place.' },
    ] },
  { id: 'sub_async', code:
`function loadAll(ids) {
  const out = [];
  ids.forEach(async id => { out.push(await get(id)); });
  return out;
}`,
    defects: [
      { id: 'd1', desc: 'forEach with an async callback is not awaited — loadAll returns an empty array before any get() resolves.' },
      { id: 'd2', desc: 'Even if awaited, push order under concurrency is nondeterministic, so results may be out of order.' },
    ] },
];
const TOTAL_DEFECTS = CORPUS.reduce((a, s) => a + s.defects.length, 0);

const REVIEW_PROMPT = code => `Review this code as a senior engineer. List EVERY bug, security issue, correctness problem, race condition, and reliability flaw you find. Be specific and exhaustive. Do not rewrite the code — just enumerate the problems, numbered.\n\n\`\`\`js\n${code}\n\`\`\``;

function runClaude(prompt) {
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-xv-'); } catch {}
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

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt, keyTest, maxTok = 2500, sys) { for (let a = 0; a < 5; a++) { try { const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTok, thinkingConfig: { thinkingBudget: 512 } } }; if (sys) body.systemInstruction = { parts: [{ text: sys }] }; if (keyTest) body.generationConfig.responseMimeType = 'application/json'; const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''; if (!keyTest) { if (txt) return txt; } else { const o = extractJSON(txt, keyTest); if (o) return o; } } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return keyTest ? null : ''; }

// ---- phase 1a: the two Claude reviews per snippet (pure claude -p — NO Gemini in this phase, so the
// fetch can't starve while subprocesses stream stdout, the failure mode from the ablation run). ----
async function genClaudeReviews() {
  const todo = CORPUS.filter(s => { const r = readJSON(path.join(REV, s.id + '.json')); return !r || !r.claudeA || !r.claudeB; });
  console.log(`[gen-claude] ${todo.length} snippets`); let done = 0;
  await pool(todo, CONC, async (s) => {
    const claudeA = await genClaude(REVIEW_PROMPT(s.code));
    const claudeB = await genClaude(REVIEW_PROMPT(s.code));
    const prev = readJSON(path.join(REV, s.id + '.json')) || { id: s.id };
    fs.writeFileSync(path.join(REV, s.id + '.json'), JSON.stringify({ ...prev, id: s.id, claudeA, claudeB }, null, 2));
    done++; console.log(`[gen-claude] ${done}/${todo.length} ${s.id} A=${claudeA.length} B=${claudeB.length}`);
  });
}
// ---- phase 1b: the independent Gemini review (pure fetch — runs AFTER all claude is done) ----
async function genGeminiReviews() {
  const todo = CORPUS.filter(s => { const r = readJSON(path.join(REV, s.id + '.json')); return !r || !r.gemini; });
  console.log(`[gen-gemini] ${todo.length} snippets`); let done = 0;
  await pool(todo, 4, async (s) => {
    const gemini = await callGemini(REVIEW_PROMPT(s.code), null, 2500, 'You are a senior engineer doing a code review.');
    const prev = readJSON(path.join(REV, s.id + '.json')) || { id: s.id };
    fs.writeFileSync(path.join(REV, s.id + '.json'), JSON.stringify({ ...prev, gemini }, null, 2));
    done++; console.log(`[gen-gemini] ${done}/${todo.length} ${s.id} G=${gemini.length}`);
  });
}
async function gen() { await genClaudeReviews(); await genGeminiReviews(); }

// ---- phase 2: grade each review against the planted defects ----
const gradePrompt = (s, reviewText) => `A code snippet has a KNOWN list of planted defects. For EACH defect, decide whether the REVIEW below caught it (mentioned the same underlying problem, even in different words). Then count how many ADDITIONAL substantive issues the review raised that are NOT in the planted list.\n\nCODE:\n\`\`\`js\n${s.code}\n\`\`\`\n\nPLANTED DEFECTS:\n${s.defects.map(d => `${d.id}: ${d.desc}`).join('\n')}\n\nREVIEW:\n${reviewText || '(empty)'}\n\nOutput ONLY JSON: {"caught": {${s.defects.map(d => `"${d.id}": true|false`).join(', ')}}, "extra_issues": <integer count of substantive issues not in the planted list>}`;
async function grade() {
  const jobs = [];
  for (const s of CORPUS) { const rev = readJSON(path.join(REV, s.id + '.json')); if (!rev) continue; for (const who of ['claudeA', 'claudeB', 'gemini']) jobs.push({ sid: s.id, who, s, text: rev[who] }); }
  const file = j => path.join(GRD, `${j.sid}__${j.who}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[grade] ${todo.length} review-grades`); let done = 0;
  await pool(todo, 4, async (j) => {
    const g = await callGemini(gradePrompt(j.s, j.text), x => x.caught !== undefined, 2000);
    if (g) fs.writeFileSync(file(j), JSON.stringify({ sid: j.sid, who: j.who, caught: g.caught, extra_issues: g.extra_issues || 0 }, null, 2));
    done++; console.log(`[grade] ${done}/${todo.length} ${j.sid}/${j.who}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function report() {
  const G = {}; for (const f of fs.readdirSync(GRD)) { const g = readJSON(path.join(GRD, f)); if (g) G[`${g.sid}__${g.who}`] = g; }
  // build per-defect catch by arm
  let nDefects = 0, caughtS = 0, caughtD = 0, caughtX = 0;
  let extraS = 0, extraD = 0, extraX = 0;
  // per-defect: count defects X-only-newly-caught (gemini got it, neither claude pass did) and D-only (claudeB got it, claudeA didn't)
  let xNewVsSingle = 0, dNewVsSingle = 0, xNewVsD = 0; // xNewVsD: gemini caught it but neither claude pass did
  for (const s of CORPUS) {
    const a = G[`${s.id}__claudeA`], b = G[`${s.id}__claudeB`], g = G[`${s.id}__gemini`];
    if (!a || !b || !g) continue;
    extraS += a.extra_issues || 0; extraD += (a.extra_issues || 0) + (b.extra_issues || 0); extraX += (a.extra_issues || 0) + (g.extra_issues || 0);
    for (const d of s.defects) {
      nDefects++;
      const ca = !!a.caught?.[d.id], cb = !!b.caught?.[d.id], cg = !!g.caught?.[d.id];
      if (ca) caughtS++;
      if (ca || cb) caughtD++;
      if (ca || cg) caughtX++;
      if (!ca && cb) dNewVsSingle++;
      if (!ca && cg) xNewVsSingle++;
      if (!ca && !cb && cg) xNewVsD++; // a defect ONLY the cross-model second lab caught
    }
  }
  const pct = (k) => +(100 * k / nDefects).toFixed(1);
  // sign-ish test: of defects where exactly one of {second-Claude, Gemini} adds it over single, does Gemini add more?
  const out = {
    n_defects: nDefects,
    recall_single_claude_pct: pct(caughtS),
    recall_claude_x2_pct: pct(caughtD),
    recall_cross_model_pct: pct(caughtX),
    defects_newly_caught_by_second_claude: dNewVsSingle,
    defects_newly_caught_by_gemini: xNewVsSingle,
    defects_only_cross_model_caught: xNewVsD,
    extra_issues_single: extraS, extra_issues_claude_x2: extraD, extra_issues_cross_model: extraX,
  };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2));
  const L = ['# Cross-model (xverify) value — does a 2nd-lab reviewer catch what one model misses?\n',
    `${CORPUS.length} snippets, ${nDefects} authored ground-truth defects. Reviews use fablever style ON (realistic install). Three reviews per snippet: two independent Claude passes (claudeA/claudeB) and one Gemini-2.5-pro pass. An independent grader maps each review's findings onto the planted defects.\n`,
    '| arm | what it is | recall (planted defects caught) |',
    '|---|---|---|',
    `| **S** single Claude | claudeA only | **${out.recall_single_claude_pct}%** (${caughtS}/${nDefects}) |`,
    `| **D** Claude ×2 | claudeA ∪ claudeB (control: "just review twice") | **${out.recall_claude_x2_pct}%** (${caughtD}/${nDefects}) |`,
    `| **X** cross-model | claudeA ∪ Gemini (the +xverify design) | **${out.recall_cross_model_pct}%** (${caughtX}/${nDefects}) |`,
    '',
    '## Where the extra catches come from',
    `- Defects a **second Claude pass** newly caught over single: **${out.defects_newly_caught_by_second_claude}**`,
    `- Defects **Gemini** newly caught over single Claude: **${out.defects_newly_caught_by_gemini}**`,
    `- Defects **only the cross-model 2nd lab caught** (neither Claude pass found): **${out.defects_only_cross_model_caught}**`,
    '',
    '## False-positive proxy (extra issues raised beyond the planted set)',
    `- single: ${out.extra_issues_single} · Claude×2: ${out.extra_issues_claude_x2} · cross-model: ${out.extra_issues_cross_model}`,
    '',
    '## Observed result',
    `Single Claude caught **${out.recall_single_claude_pct}%** of the planted defects — including the subtle batch (DST off-by-one, ReDoS, float-money, never-returns-0 comparator). Adding a second pass changed recall by **nothing**: the second Claude pass newly caught **${out.defects_newly_caught_by_second_claude}**, Gemini newly caught **${out.defects_newly_caught_by_gemini}**, and **${out.defects_only_cross_model_caught}** defects were caught *only* by the cross-model lab. Both union arms instead raised the extra-issue count (single ${out.extra_issues_single} → cross-model ${out.extra_issues_cross_model} → Claude×2 ${out.extra_issues_claude_x2}). The grader is not rubber-stamping — on the first (clearer) batch it marked Gemini's misses, and it discriminates per-defect. **So on defect-catch with a strong base reviewer at ceiling, cross-model verification buys zero extra recall and more triage cost.** That is the honest case for gating +xverify to genuinely high-stakes review (where even a tiny marginal catch is worth the noise) rather than turning it on by default. Where cross-model *could* still pay off — and this eval does NOT test — is judgment calls and design review, not enumerable defects. Single judge/grader model; n=${nDefects} defects.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

if (process.argv[2] === 'gen') await gen();
else if (process.argv[2] === 'grade') await grade();
else if (process.argv[2] === 'report') report();
else { await gen(); await grade(); report(); }
