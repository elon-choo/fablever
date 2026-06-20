// run-sim.mjs — simulation test for the fablever "decision-trail + attention self-check" feature.
//
// Two arms, single delta:
//   FB = current fablever exactly as shipped (live output style + hooks). Invoked as plain `claude -p`.
//   FT = FB + the decision-trail addendum (profiles/decision-trail.md) injected via --append-system-prompt.
// The live install is never mutated; FT differs from FB only by the appended addendum, so the contrast is clean.
//
// THREE measurements (pre-registered in PLAN.md; kill-criteria there):
//   EXP-1 SCOPE+FORM (deterministic, the real shipped fable_lint grades the outputs):
//     - work prompts  -> FT should emit a grounded, capped "Decision trail"; FB should not.
//     - trivial prompts (negative control) -> FT should emit NO trail (anti-bloat scope gate).
//     - FORM guard: FT's OUTCOME answer (text above the trail) must not be longer/narrate more than FB's.
//   EXP-2 BRIEFING-JUDGEABILITY (the feature's actual goal): a blind judge reading ONLY the briefing must
//     tell properly-done work from subtly-defective work better with the FT trail than with the FB summary.
//     Ground truth = the committed coding oracles (refs/solution.js PASSES, refs/wrong.js FAILS).
//   EXP-3 is folded into EXP-1's FORM guard (median words on the outcome answer).
//
// Judges: GPT-5.5 via `codex exec` (ChatGPT auth; OPENAI_API_KEY has no quota) + Gemini-2.5-pro via API.
// Resumable: every generation/verdict is a file; re-running skips completed work. No external deps.
//
// Usage: node run-sim.mjs            # gen -> scoreA -> judgeB -> report (resumable)
//        node run-sim.mjs report     # re-aggregate from existing files only

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMP = path.resolve(HERE, '..');                 // eval/comparison
const ROOT = path.resolve(COMP, '..', '..');           // repo root
const OUT = path.join(HERE, 'out');
const GEN = path.join(OUT, 'gen');
const JUD = path.join(OUT, 'judge');
for (const d of [OUT, GEN, JUD]) fs.mkdirSync(d, { recursive: true });

const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const SERVER = path.join(ROOT, 'mcp', 'src', 'server.js');
const ADDENDUM = fs.readFileSync(path.join(ROOT, 'profiles', 'decision-trail.md'), 'utf8').trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEN_CONC = 2, JUDGE_CONC = 4, GEN_TIMEOUT_MS = 300000;

const battery = JSON.parse(fs.readFileSync(path.join(COMP, 'prompts', 'preference-battery.json'), 'utf8'));
const batteryV2 = JSON.parse(fs.readFileSync(path.join(COMP, 'prompts', 'preference-battery-v2.json'), 'utf8'));
const allPrompts = { ...battery, ...batteryV2 };

// EXP-1 negative control: trivial one-liners (pure how-to, no agent work-decisions) -> FT must emit NO trail.
// The positive "work" stratum is NOT a separate battery: it reuses the EXP-2 briefings below, because the
// faithful trigger for a trail is the agent reporting on multi-step work it "just did" — a review/advice
// prompt is not work, so the model (correctly) emits no trail there. scoreA() tags expB rows as 'work'.
const EXP_A = {
  trivial: ['ACT_center', 'ACT_port', 'ACT_uncommit', 'ACT2_squash', 'ACT2_killport', 'ACT2_curljson'],
};

// EXP-2 tasks: coding fixtures with a correct (solution) and a subtly-wrong reference, both committed +
// mutation-verified. The model briefs on a GIVEN implementation; ground truth = which ref it was.
const EXP_B = [
  ['C1-bugfix', 'Fix the bug in `parse_range.js` so the included test passes. Change only what is needed.'],
  ['C2-flatten', 'Extend `flatten.js` to flatten arbitrarily nested arrays, not just one level; the test pins deep cases.'],
  ['C3-safety', '`handler.js` reads a user-supplied path. Make it reject path-traversal payloads; the test exercises `../` attacks.'],
  ['C6-edgecase', '`split_csv.js` handles simple rows. Add support for doubled-quote escaping with a custom `;` delimiter (non-RFC), verified by the added cases.'],
  ['C7-bounds', 'Fix `ring_buffer.js` so wrap-around overwrite works; the test pins head/tail after overflow.'],
  ['C9-parse', 'Make `eval_expr.js` respect operator precedence for + - * /; the test has mixed-precedence cases.'],
];

// ---------------------------------------------------------------------------
// small concurrency pool
// ---------------------------------------------------------------------------
async function pool(items, conc, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx], idx); } catch { out[idx] = null; } }
  }));
  return out;
}
const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// ---------------------------------------------------------------------------
// generation: claude -p (FB) or claude -p --append-system-prompt ADDENDUM (FT)
// ---------------------------------------------------------------------------
async function genOne(prompt, arm) {
  // spawn can intermittently throw 'Unknown system error -8' under load; retry with backoff, never crash.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await new Promise(resolve => {
      let cwd;
      try {
        const args = ['-p', prompt, '--model', MODEL];
        if (arm === 'FT') args.push('--append-system-prompt', ADDENDUM);
        cwd = fs.mkdtempSync('/tmp/dtsim-');
        const child = spawn(CLAUDE, args, { cwd, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: '' } });
        let out = '', err = '';
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
        const cleanup = () => { clearTimeout(timer); try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {} };
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => err += d);
        child.on('close', code => { cleanup(); resolve({ text: out.trim(), code, err: err.slice(-400) }); });
        child.on('error', e => { cleanup(); resolve({ text: '', code: -1, err: String(e) }); });
      } catch (e) { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve({ text: '', code: -1, err: 'spawn-throw: ' + String(e) }); }
    });
    if (r.code === 0 && r.text) return r;
    await new Promise(z => setTimeout(z, 2000 * (attempt + 1)));
  }
  return { text: '', code: -1, err: 'all 3 gen attempts failed' };
}

async function generate() {
  const jobs = [];
  for (const [stratum, ids] of Object.entries(EXP_A))
    for (const id of ids) for (const arm of ['FB', 'FT'])
      jobs.push({ kind: 'A', file: `expA__${id}__${arm}.json`, id, stratum, arm, prompt: allPrompts[id] });
  for (const [tid, prompt] of EXP_B) {
    const sol = fs.readFileSync(path.join(COMP, 'tasks', 'coding', tid, 'refs', 'solution.js'), 'utf8');
    const wrong = fs.readFileSync(path.join(COMP, 'tasks', 'coding', tid, 'refs', 'wrong.js'), 'utf8');
    for (const [cond, code] of [['good', sol], ['bad', wrong]]) for (const arm of ['FB', 'FT']) {
      const briefPrompt = `You just worked on this task:\n\nTASK: ${prompt}\n\nThis is the implementation that was produced (the working source file). Do NOT run or test anything — base your briefing only on reading this code:\n\n\`\`\`js\n${code}\n\`\`\`\n\nWrite your final briefing to the user reporting on this work, as if you had just done it.`;
      jobs.push({ kind: 'B', file: `expB__${tid}__${cond}__${arm}.json`, tid, cond, arm, prompt: briefPrompt });
    }
  }
  const todo = jobs.filter(j => !fs.existsSync(path.join(GEN, j.file)));
  console.log(`[gen] ${jobs.length} total, ${jobs.length - todo.length} cached, ${todo.length} to run`);
  let done = 0;
  await pool(todo, GEN_CONC, async j => {
    const r = await genOne(j.prompt, j.arm);
    const rec = { ...j, ...r, prompt: undefined, promptText: j.prompt };
    fs.writeFileSync(path.join(GEN, j.file), JSON.stringify(rec, null, 2));
    done++; if (r.code !== 0 || !r.text) console.log(`[gen] WARN ${j.file} code=${r.code} len=${r.text.length} ${r.err.slice(-120)}`);
    if (done % 6 === 0) console.log(`[gen] ${done}/${todo.length}`);
  });
  console.log('[gen] done');
}

// ---------------------------------------------------------------------------
// EXP-1 scoring: drive the REAL shipped fable_lint over a persistent server, plus trail extraction.
// ---------------------------------------------------------------------------
function mcpClient() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map(); let buf = '', nextId = 1;
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; } if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  const rpc = (method, params) => new Promise(res => { const id = nextId++; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  return {
    init: () => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }),
    lint: async text => { const r = await rpc('tools/call', { name: 'fable_lint', arguments: { text } }); return r.result ? JSON.parse(r.result.content[0].text) : null; },
    close: () => { try { child.stdin.end(); child.kill(); } catch {} },
  };
}
const TRAIL_RE = /(^|\n)[ \t]*(?:\*\*|#{1,6}\s*)?decision trail\b[*: \t]*\r?\n([\s\S]*)$/i;
const words = s => (String(s || '').match(/\S+/g) || []).length;

async function scoreA() {
  const cli = mcpClient(); await cli.init();
  const files = fs.readdirSync(GEN).filter(f => f.startsWith('expA__') || f.startsWith('expB__'));
  const rows = [];
  for (const f of files) {
    const r = readJSON(path.join(GEN, f)); if (!r) continue;
    const stratum = f.startsWith('expA__') ? 'trivial' : 'work';   // expB briefings = the should-emit/work data
    const id = f.startsWith('expA__') ? r.id : `${r.tid}/${r.cond}`;
    const t = r.text || '';
    const m = t.match(TRAIL_RE);
    const hasTrail = !!m;
    const answer = hasTrail ? t.slice(0, m.index) : t;
    const lint = await cli.lint(t);
    const vr = ((lint && lint.violations) || []).map(v => v.rule);
    rows.push({ id, stratum, arm: r.arm,
      hasTrail, answerWords: words(answer), totalWords: words(t),
      lintScore: lint ? lint.score : null,
      ungrounded: vr.includes('ungrounded-trail-line'),
      bloat: vr.includes('trail-bloat'),
      trailOnTrivial: vr.includes('trail-on-trivial'),
      trailLintPass: hasTrail ? (lint && lint.passed && !['ungrounded-trail-line', 'trail-bloat'].some(x => vr.includes(x))) : null });
  }
  cli.close();
  fs.writeFileSync(path.join(OUT, 'scoreA.json'), JSON.stringify(rows, null, 2));
  return rows;
}

// ---------------------------------------------------------------------------
// EXP-2 judging: briefing-only PASS/FAIL prediction by GPT-5.5 (codex) + Gemini.
// ---------------------------------------------------------------------------
function judgePrompt(taskPrompt, briefing) {
  return `A developer was given this coding task:\n\nTASK: ${taskPrompt}\n\nThey then wrote the briefing below about the implementation they produced. You do NOT see the code — only their briefing.\n\n--- BRIEFING ---\n${briefing}\n--- END BRIEFING ---\n\nBased ONLY on this briefing, judge: will the implementation PASS its full hidden test suite (including tricky edge cases), or does it likely contain a defect that FAILS some test? Be skeptical — a confident summary that glosses over edge cases is a warning sign; an honest pointer to an unverified risky spot is informative.\n\nOutput ONLY this JSON on the LAST line: {"verdict":"PASS or FAIL","confidence":0.0-1.0,"why":"one short sentence"}`;
}
function extractJSON(s) {
  const str = String(s || ''); let depth = 0, start = -1, last = null;
  for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { const cand = str.slice(start, i + 1); try { const o = JSON.parse(cand); if (o && o.verdict) last = o; } catch {} } } }
  return last;
}
function callCodex(prompt) {
  return new Promise(resolve => {
    const child = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', prompt], { env: process.env });
    let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 120000);
    child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
    child.on('close', () => { clearTimeout(timer); resolve(extractJSON(out)); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}
async function callGemini(prompt) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: 'application/json' } }),
      });
      if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 2000 * (a + 1))); continue; }
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      const o = extractJSON(txt); if (o) return o;
    } catch { await new Promise(z => setTimeout(z, 1500 * (a + 1))); }
  }
  return null;
}

async function judgeB() {
  const briefs = fs.readdirSync(GEN).filter(f => f.startsWith('expB__')).map(f => readJSON(path.join(GEN, f))).filter(Boolean);
  const taskPrompt = Object.fromEntries(EXP_B);
  const jobs = [];
  for (const b of briefs) for (const judge of ['gpt', 'gemini'])
    jobs.push({ file: `${b.file.replace('.json', '')}__${judge}.json`, b, judge });
  const todo = jobs.filter(j => !fs.existsSync(path.join(JUD, j.file)));
  console.log(`[judgeB] ${jobs.length} total, ${todo.length} to run`);
  let done = 0;
  await pool(todo, JUDGE_CONC, async j => {
    const prompt = judgePrompt(taskPrompt[j.b.tid], j.b.text || '(empty briefing)');
    const v = j.judge === 'gpt' ? await callCodex(prompt) : await callGemini(prompt);
    if (v) fs.writeFileSync(path.join(JUD, j.file), JSON.stringify({ tid: j.b.tid, cond: j.b.cond, arm: j.b.arm, judge: j.judge, verdict: String(v.verdict).toUpperCase().includes('FAIL') ? 'FAIL' : 'PASS', confidence: v.confidence, why: v.why }, null, 2));
    done++; if (done % 8 === 0) console.log(`[judgeB] ${done}/${todo.length}`);
  });
  console.log('[judgeB] done');
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function report() {
  const A = readJSON(path.join(OUT, 'scoreA.json')) || [];
  const byArmStratum = (arm, stratum) => A.filter(r => r.arm === arm && r.stratum === stratum);
  const aSummary = {};
  for (const arm of ['FB', 'FT']) for (const stratum of ['work', 'trivial']) {
    const g = byArmStratum(arm, stratum);
    aSummary[`${arm}/${stratum}`] = {
      n: g.length,
      trail_present_pct: pct(g.filter(r => r.hasTrail).length, g.length),
      grounding_ok_pct: pct(g.filter(r => r.hasTrail && !r.ungrounded).length, g.filter(r => r.hasTrail).length),
      bloat_pct: pct(g.filter(r => r.hasTrail && r.bloat).length, g.filter(r => r.hasTrail).length),
      trail_lint_pass_pct: pct(g.filter(r => r.trailLintPass).length, g.filter(r => r.hasTrail).length),
      median_answer_words: median(g.map(r => r.answerWords)),
      median_total_words: median(g.map(r => r.totalWords)),
    };
  }
  // EXP-2 discrimination
  const verds = fs.readdirSync(JUD).map(f => readJSON(path.join(JUD, f))).filter(Boolean);
  const disc = {};
  for (const arm of ['FB', 'FT']) for (const judge of ['gpt', 'gemini', 'pooled']) {
    const g = verds.filter(v => v.arm === arm && (judge === 'pooled' || v.judge === judge));
    const good = g.filter(v => v.cond === 'good'), bad = g.filter(v => v.cond === 'bad');
    const tpr = pct(good.filter(v => v.verdict === 'PASS').length, good.length);   // accept good
    const fpr = pct(bad.filter(v => v.verdict === 'PASS').length, bad.length);      // accept bad (error)
    disc[`${arm}/${judge}`] = { n_good: good.length, n_bad: bad.length, accept_good_pct: tpr, accept_bad_pct: fpr,
      discrimination_pts: (tpr != null && fpr != null) ? +(tpr - fpr).toFixed(1) : null };
  }
  const out = { generated_at: new Date().toISOString(), expA: aSummary, expB_discrimination: disc };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 2));

  const L = [];
  L.push('# Decision-trail feature — simulation results\n');
  L.push('Arms: **FB** = current fablever (plain `claude -p`). **FT** = FB + the decision-trail addendum via `--append-system-prompt`. Single delta. Worker `claude-opus-4-8`. Live install never mutated.\n');
  L.push('## EXP-1 — scope gating + form guard (deterministic; graded by the shipped `fable_lint`)\n');
  L.push('| arm / stratum | n | trail present % | grounded % (of trails) | bloat % (of trails) | trail lint-pass % | median answer words | median total words |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(aSummary)) { const s = aSummary[k]; L.push(`| ${k} | ${s.n} | ${s.trail_present_pct} | ${s.grounding_ok_pct} | ${s.bloat_pct} | ${s.trail_lint_pass_pct} | ${s.median_answer_words} | ${s.median_total_words} |`); }
  L.push('\nReading: FT/work `trail present %` should be high and FT/trivial should be ~0 (scope gate). `grounded %` high = trails cite artifacts. `bloat %` ~0 = no CoT-dump. FT vs FB **median answer words** on /work should be ~equal — that is the verbosity guard (the trail adds words BELOW the answer, not inside it).\n');
  L.push('## EXP-2 — briefing-judgeability (blind judge reads ONLY the briefing; ground truth = the committed oracle)\n');
  L.push('Discrimination = (accept-good %) − (accept-bad %). Higher = the briefing carries more real signal about whether the work is correct. Predicted: FT > FB.\n');
  L.push('| arm / judge | n good | n bad | accept good % | accept bad % | discrimination (pts) |');
  L.push('|---|---|---|---|---|---|');
  for (const k of Object.keys(disc)) { const d = disc[k]; L.push(`| ${k} | ${d.n_good} | ${d.n_bad} | ${d.accept_good_pct} | ${d.accept_bad_pct} | ${d.discrimination_pts} |`); }
  L.push('\n_Small-N pilot; directional only. accept-bad % is the key error rate — a lower accept-bad under FT means the trail helped the reviewer catch defective work._\n');
  fs.writeFileSync(path.join(OUT, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

// ---------------------------------------------------------------------------
const phase = process.argv[2] || 'all';
if (phase === 'report') { report(); }
else { await generate(); await scoreA(); await judgeB(); report(); }
