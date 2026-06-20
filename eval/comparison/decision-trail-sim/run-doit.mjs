// run-doit.mjs — Round 2, faithful manipulation: the agent ACTUALLY does the work (fixes a buggy stub),
// then its OWN fix is scored by the committed oracle. This is the real trigger for a decision trail (the
// agent wrote/changed code), unlike Round 1's "report on given code" framing where the trail under-fired.
//
//   FB = plain `claude -p` (current fablever).  FT = FB + profiles/decision-trail.md via --append-system-prompt.
// Per task: stage ONLY the stub (+ prompt) into a temp dir; the model edits it; then the committed test.js
// is run against the edited file (exit 0 = PASS). The model never sees the test or refs while working.
//
// Measures: trail-present % (FT/work should now be HIGH; FT/trivial ~0), grounded %, bloat %, FB-vs-FT
// answer words (verbosity guard), and the oracle PASS rate FB vs FT (outcome — predicted ~tie, must not drop).
// Trivial control reuses Round 1's expA generations (the trigger fix does not affect trivial: still no trail).
//
// Usage: node run-doit.mjs   (resumable)   |   node run-doit.mjs report

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMP = path.resolve(HERE, '..');
const ROOT = path.resolve(COMP, '..', '..');
const OUT = path.join(HERE, 'out2'); const GEN = path.join(OUT, 'gen');
const R1GEN = path.join(HERE, 'out', 'gen');     // Round 1 generations (reuse the trivial control)
for (const d of [OUT, GEN]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const ADDENDUM = fs.readFileSync(path.join(ROOT, 'profiles', 'decision-trail.md'), 'utf8').trim();
const GEN_CONC = 2, GEN_TIMEOUT_MS = 300000;
const ANTIHARD = '\n\nImplement the general behaviour; do not hardcode or lookup-table specific inputs.';

const TASKS = [
  ['C1-bugfix', 'parse_range.js', 'Fix the bug in `parse_range.js` so the included test passes. Change only what is needed.'],
  ['C2-flatten', 'flatten.js', 'Extend `flatten.js` to flatten arbitrarily nested arrays, not just one level; the test pins deep cases.'],
  ['C3-safety', 'handler.js', '`handler.js` reads a user-supplied path. Make it reject path-traversal payloads; the test exercises `../` attacks.'],
  ['C6-edgecase', 'split_csv.js', '`split_csv.js` handles simple rows. Add support for doubled-quote escaping with a custom `;` delimiter (non-RFC).'],
  ['C7-bounds', 'ring_buffer.js', 'Fix `ring_buffer.js` so wrap-around overwrite works; the test pins head/tail after overflow.'],
  ['C9-parse', 'eval_expr.js', 'Make `eval_expr.js` respect operator precedence for + - * /; the test has mixed-precedence cases.'],
];

const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 120)); } } })); }

function runClaude(prompt, arm, cwd) {
  return new Promise(resolve => {
    let child; try {
      // acceptEdits is REQUIRED: headless `claude -p` otherwise blocks Edit/Write, so the model can't
      // actually apply the fix and the oracle would always score the untouched buggy stub.
      // FT uses the FableTrail OUTPUT STYLE (the faithful adoption path), not --append-system-prompt:
      // Round 2a proved a lone appended instruction loses to fablever's live minimalism and the trail
      // never fires. FableTrail = live Fable + ONLY the trail principle (verified single delta).
      const args = ['-p', prompt, '--permission-mode', 'acceptEdits', '--model', MODEL]; if (arm === 'FT') args.push('--settings', '{"outputStyle":"FableTrail"}');
      child = spawn(CLAUDE, args, { cwd, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
      let out = '', err = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
      child.on('close', code => { clearTimeout(timer); resolve({ text: out.trim(), code, err: err.slice(-300) }); });
      child.on('error', e => { clearTimeout(timer); resolve({ text: '', code: -1, err: String(e) }); });
    } catch (e) { resolve({ text: '', code: -1, err: 'spawn-throw: ' + String(e) }); }
  });
}
function scoreOracle(tid, stub, cwd) {
  try { fs.copyFileSync(path.join(COMP, 'tasks', 'coding', tid, 'test.js'), path.join(cwd, 'test.js'));
    execFileSync('node', ['test.js'], { cwd, stdio: 'ignore', timeout: 30000 }); return true; }
  catch { return false; }
}
async function genDoIt(tid, stub, prompt, arm) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cwd = fs.mkdtempSync('/tmp/doit-');
    try {
      fs.copyFileSync(path.join(COMP, 'tasks', 'coding', tid, stub), path.join(cwd, stub));
      const r = await runClaude(prompt + ANTIHARD, arm, cwd);
      if (r.code === 0 && r.text) { const pass = scoreOracle(tid, stub, cwd); fs.rmSync(cwd, { recursive: true, force: true }); return { ...r, pass }; }
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch (e) { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {} }
    await new Promise(z => setTimeout(z, 2500 * (attempt + 1)));
  }
  return { text: '', code: -1, pass: false, err: 'all attempts failed' };
}

async function generate() {
  const jobs = [];
  for (const [tid, stub, prompt] of TASKS) for (const arm of ['FB', 'FT']) jobs.push({ file: `doit__${tid}__${arm}.json`, tid, stub, prompt, arm });
  const todo = jobs.filter(j => !fs.existsSync(path.join(GEN, j.file)));
  console.log(`[doit] ${jobs.length} total, ${todo.length} to run`); let done = 0;
  await pool(todo, GEN_CONC, async j => {
    const r = await genDoIt(j.tid, j.stub, j.prompt, j.arm);
    fs.writeFileSync(path.join(GEN, j.file), JSON.stringify({ tid: j.tid, arm: j.arm, pass: r.pass, code: r.code, text: r.text }, null, 2));
    done++; console.log(`[doit] ${done}/${todo.length} ${j.file} pass=${r.pass} trail=${/decision trail/i.test(r.text || '')}`);
  });
}

// scoring
function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map(); let buf = '', nextId = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; } if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(res => { const id = nextId++; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return { init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }),
    lint: async text => { const r = await rpc('tools/call', { name: 'fable_lint', arguments: { text } }); return r.result ? JSON.parse(r.result.content[0].text) : null; },
    close: () => { try { child.stdin.end(); child.kill(); } catch {} } };
}
const TRAIL_RE = /(^|\n)[ \t]*(?:\*\*|#{1,6}\s*)?decision trail\b[*: \t]*\r?\n([\s\S]*)$/i;
const words = s => (String(s || '').match(/\S+/g) || []).length;
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;

async function scoreRow(cli, text, stratum, arm, pass) {
  const t = text || ''; const m = t.match(TRAIL_RE); const hasTrail = !!m; const answer = hasTrail ? t.slice(0, m.index) : t;
  const lint = await cli.lint(t); const vr = ((lint && lint.violations) || []).map(v => v.rule);
  return { stratum, arm, pass, hasTrail, answerWords: words(answer), totalWords: words(t),
    ungrounded: vr.includes('ungrounded-trail-line'), bloat: vr.includes('trail-bloat'), trailOnTrivial: vr.includes('trail-on-trivial'),
    trailLintPass: hasTrail ? (lint && lint.passed && !['ungrounded-trail-line', 'trail-bloat'].some(x => vr.includes(x))) : null };
}

async function report() {
  const cli = mcpClient(); await cli.init(); const rows = [];
  for (const f of fs.readdirSync(GEN).filter(x => x.startsWith('doit__'))) { const r = readJSON(path.join(GEN, f)); if (r) rows.push(await scoreRow(cli, r.text, 'work', r.arm, r.pass)); }
  // trivial control reused from Round 1
  for (const f of (fs.existsSync(R1GEN) ? fs.readdirSync(R1GEN).filter(x => x.startsWith('expA__')) : [])) { const r = readJSON(path.join(R1GEN, f)); if (r) rows.push(await scoreRow(cli, r.text, 'trivial', r.arm, null)); }
  cli.close();
  const summary = {};
  for (const arm of ['FB', 'FT']) for (const stratum of ['work', 'trivial']) {
    const g = rows.filter(r => r.arm === arm && r.stratum === stratum); const trails = g.filter(r => r.hasTrail);
    summary[`${arm}/${stratum}`] = { n: g.length, trail_present_pct: pct(trails.length, g.length),
      grounded_pct: pct(trails.filter(r => !r.ungrounded).length, trails.length), bloat_pct: pct(trails.filter(r => r.bloat).length, trails.length),
      trail_lint_pass_pct: pct(g.filter(r => r.trailLintPass).length, trails.length),
      median_answer_words: median(g.map(r => r.answerWords)), median_total_words: median(g.map(r => r.totalWords)),
      oracle_pass_pct: stratum === 'work' ? pct(g.filter(r => r.pass).length, g.length) : null };
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  const L = ['# Decision-trail — Round 2 (DO-IT: agent fixes a stub; its own fix scored by the committed oracle)\n',
    'Trigger fixed after Round 1 (fire on any code change / multi-step fix, not only multi-file). FB = plain fablever, FT = + decision-trail addendum. Worker `claude-opus-4-8`. Live install untouched.\n',
    '| arm / stratum | n | trail present % | grounded % | bloat % | trail lint-pass % | median answer words | median total words | oracle PASS % |',
    '|---|---|---|---|---|---|---|---|---|'];
  for (const k of Object.keys(summary)) { const s = summary[k]; L.push(`| ${k} | ${s.n} | ${s.trail_present_pct} | ${s.grounded_pct} | ${s.bloat_pct} | ${s.trail_lint_pass_pct} | ${s.median_answer_words} | ${s.median_total_words} | ${s.oracle_pass_pct} |`); }
  L.push('\nReading: FT/work trail-present % should now be high (the trigger fix); FT/trivial ~0 (scope gate holds). grounded % high + bloat % ~0 = the trail is an evidence ledger, not a CoT dump. FB vs FT **median answer words** on /work ~equal = the verbosity guard (trail adds words below the answer). **oracle PASS %** FB vs FT ~equal = the trail did not lower task success.\n');
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

const phase = process.argv[2] || 'all';
if (phase === 'report') await report(); else { await generate(); await report(); }
