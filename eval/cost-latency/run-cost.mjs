// run-cost.mjs — Cost & latency DIRECTION: plain Opus (B) vs fablever style (F).
// fablever's output style ADDS a fixed chunk to the system prompt (more input/cache tokens) but its
// restraint trims the DELIVERABLE (fewer output tokens). The net direction on tokens, $, and wall-clock
// is an empirical question this answers — deterministically, NO judge. Same base model; baseline
// isolation per ../comparison/BASELINE-VALIDATION.md (B = outputStyle:default + FABLE_PROFILE=off;
// F = outputStyle:Fable + FABLE_PROFILE='').
//
// Each call uses `claude -p --output-format json`, whose final `result` event carries usage
// (input/output/cache tokens), total_cost_usd, and duration_ms. We record per (task, arm).
//
// Usage: node run-cost.mjs            (gen -> report)
//        node run-cost.mjs gen|report|tasks

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
fs.mkdirSync(RAW, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEN_CONC = 3, GEN_TIMEOUT_MS = 220000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

// 16 frozen tasks spanning the same 6 domains as the ablation, mix of short and long deliverables
// (output length is where fablever's restraint shows up, so the mix matters).
const BATTERY = [
  { id: 'res1', prompt: 'Should we use Postgres or MongoDB for an early B2B SaaS primary datastore? Give me a recommendation and your reasoning.' },
  { id: 'res2', prompt: 'Should we use REST or GraphQL for a mobile app API? Recommendation + reasoning.' },
  { id: 'res3', prompt: 'Should we build or buy an auth system for a B2B product? Recommendation + reasoning.' },
  { id: 'doc1', prompt: 'Write a short decision/planning memo on migrating CI from Jenkins to GitHub Actions.' },
  { id: 'doc2', prompt: 'Write a short decision/planning memo on adopting TypeScript across our JS codebase.' },
  { id: 'doc3', prompt: 'Write a short decision/planning memo on standing up an on-call rotation and incident process.' },
  { id: 'bug1', prompt: "This should return the LAST index of x but returns the first:\n\nfunction lastIndexOf(arr,x){for(let i=0;i<arr.length;i++){if(arr[i]===x)return i;}return -1;}\n\nFix it and confirm it is done." },
  { id: 'bug2', prompt: 'This retry never waits between attempts:\n\nasync function retry(fn,n){for(let i=0;i<n;i++){try{return await fn();}catch(e){if(i===n-1)throw e;}}}\n\nAdd exponential backoff and confirm.' },
  { id: 'bug3', prompt: 'Optimize this O(n^2) dedup and report the improvement:\n\nfunction dedup(a){return a.filter((x,i)=>a.indexOf(x)===i);}' },
  { id: 'rev1', prompt: "Review this code and tell me what's wrong with it. Just identify the problems — do NOT rewrite or fix the code.\n\nfunction getUser(id){ return db.query(\"SELECT * FROM users WHERE id = \" + id); }" },
  { id: 'rev2', prompt: "Review this code and tell me what's wrong with it. Just identify the problems — do NOT rewrite or fix the code.\n\nconst token = jwt.sign({user}, \"secret123\"); // hardcoded" },
  { id: 'scp1', prompt: 'Should we delete the legacy `users_old` table? Just advise — do not write any migration or SQL.' },
  { id: 'scp2', prompt: 'Is this O(n) or O(n^2)? Answer only — do not optimize or rewrite it.\n\nfunction f(a){return a.map(x=>a.filter(y=>y<x).length);}' },
  { id: 'mkt1', prompt: 'Write hero copy (2-3 short paras) for "Inbox Zero AI", which auto-summarizes and triages email. Ready to ship.' },
  { id: 'mkt2', prompt: 'Write 3 subject-line angles for a re-engagement email to lapsed meditation-app users; say which to send.' },
  { id: 'mkt3', prompt: 'Write a one-line value prop + 2 supporting bullets for a no-code internal-tools builder.' },
];

// Returns { text, usage, cost, duration_ms, duration_api_ms, num_turns } or null on failure.
function runClaudeMetered(prompt, arm) {
  const onFable = arm === 'F';
  const settings = onFable ? '{"outputStyle":"Fable"}' : '{"outputStyle":"default"}';
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-cost-'); } catch {}
    const done = (v) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(v); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--settings', settings], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: onFable ? '' : 'off' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const arr = JSON.parse(out);
          const r = Array.isArray(arr) ? arr.find(e => e.type === 'result') : null;
          if (!r || r.is_error) return done(null);
          const u = r.usage || {};
          done({
            text: String(r.result || ''),
            input_tokens: u.input_tokens || 0,
            output_tokens: u.output_tokens || 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
            cache_read_input_tokens: u.cache_read_input_tokens || 0,
            cost: r.total_cost_usd || 0,
            duration_ms: r.duration_ms || 0,
            duration_api_ms: r.duration_api_ms || 0,
            num_turns: r.num_turns || 0,
          });
        } catch { done(null); }
      });
      child.on('error', () => { clearTimeout(timer); done(null); });
    } catch { done(null); }
  });
}
async function meter(prompt, arm) { for (let a = 0; a < 3; a++) { const v = await runClaudeMetered(prompt, arm); if (v && v.output_tokens > 0) return v; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return null; }

async function generate() {
  const todo = BATTERY.filter(t => !fs.existsSync(path.join(RAW, t.id + '.json')));
  console.log(`[gen] ${BATTERY.length} tasks, ${todo.length} to run`); let done = 0;
  await pool(todo, GEN_CONC, async (task) => {
    const B = await meter(task.prompt, 'B'), F = await meter(task.prompt, 'F');
    fs.writeFileSync(path.join(RAW, task.id + '.json'), JSON.stringify({ id: task.id, B, F }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${task.id} out B=${B?.output_tokens} F=${F?.output_tokens} $B=${B?.cost?.toFixed(4)} $F=${F?.cost?.toFixed(4)}`);
  });
}

const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const f2 = n => +Number(n).toFixed(2);
const f4 = n => +Number(n).toFixed(4);
// exact two-sided sign test (ignoring ties)
function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }

const median = xs => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function report() {
  const raws = BATTERY.map(t => readJSON(path.join(RAW, t.id + '.json'))).filter(r => r && r.B && r.F);
  // Some -p calls fan out into multi-turn tool loops (on EITHER arm) — that agentic variance, not the style,
  // dominates their token/cost. The clean apples-to-apples view is the subset where BOTH arms ran one turn.
  const single = raws.filter(r => r.B.num_turns === 1 && r.F.num_turns === 1);
  const multi = raws.filter(r => !(r.B.num_turns === 1 && r.F.num_turns === 1)).map(r => ({ id: r.id, B_turns: r.B.num_turns, F_turns: r.F.num_turns }));
  const stat = (set, arm, k, agg) => agg(set.map(r => r[arm][k]));
  const block = (set) => ({
    n: set.length,
    out_mean: { B: Math.round(stat(set, 'B', 'output_tokens', mean)), F: Math.round(stat(set, 'F', 'output_tokens', mean)) },
    out_med: { B: median(set.map(r => r.B.output_tokens)), F: median(set.map(r => r.F.output_tokens)) },
    cost_mean: { B: f4(stat(set, 'B', 'cost', mean)), F: f4(stat(set, 'F', 'cost', mean)) },
    cost_med: { B: f4(median(set.map(r => r.B.cost))), F: f4(median(set.map(r => r.F.cost))) },
    dur_mean: { B: Math.round(stat(set, 'B', 'duration_ms', mean)), F: Math.round(stat(set, 'F', 'duration_ms', mean)) },
    cache_create: { B: Math.round(stat(set, 'B', 'cache_creation_input_tokens', mean)), F: Math.round(stat(set, 'F', 'cache_creation_input_tokens', mean)) },
    cache_read: { B: Math.round(stat(set, 'B', 'cache_read_input_tokens', mean)), F: Math.round(stat(set, 'F', 'cache_read_input_tokens', mean)) },
  });
  const A = block(raws), S = block(single);
  // direction tests on the clean single-turn subset
  let fLessOut = 0, decOut = 0, fCheap = 0, decCost = 0;
  for (const r of single) { if (r.F.output_tokens !== r.B.output_tokens) { decOut++; if (r.F.output_tokens < r.B.output_tokens) fLessOut++; } if (r.F.cost !== r.B.cost) { decCost++; if (r.F.cost < r.B.cost) fCheap++; } }
  const styleBlock = S.cache_create.F - S.cache_create.B; // measured input overhead of the style block
  const costPremiumPct = f2(100 * (S.cost_mean.F - S.cost_mean.B) / S.cost_mean.B);
  const out = { n_all: raws.length, n_single_turn: single.length, multi_turn_excluded: multi, all: A, single_turn: S, style_block_input_overhead_tokens: styleBlock, cost_premium_pct_single_turn: costPremiumPct, F_fewer_output_tokens_single: `${fLessOut}/${decOut}`, F_cheaper_single: `${fCheap}/${decCost}` };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2));
  const L = ['# Cost & latency — plain Opus (B) vs fablever style (F)\n',
    `${out.n_all} frozen tasks, same base model (${MODEL}). Each call run with \`--output-format json\`; the \`result\` event's \`usage\`/\`total_cost_usd\`/\`duration_ms\` are recorded verbatim. No judge — pure measurement.\n`,
    `**Why two views.** ${out.multi_turn_excluded.length} of ${out.n_all} tasks fanned out into multi-turn tool loops on at least one arm (${out.multi_turn_excluded.map(m => `${m.id}: B=${m.B_turns}t/F=${m.F_turns}t`).join(', ')}) — that agentic variance, not the style, dominates their tokens, and it hits **both** arms (plain ran the most turns on bug2/bug3). So the headline is the **single-turn subset (n=${out.n_single_turn})**, the clean apples-to-apples deliverable; the all-tasks means are shown too, with the caveat.\n`,
    '## Single-turn subset (clean comparison)',
    '| metric | B (plain) | F (fablever) | read |',
    '|---|---|---|---|',
    `| output tokens — mean | ${S.out_mean.B} | ${S.out_mean.F} | ~neutral (F writes full sentences on short asks, trims long ones) |`,
    `| output tokens — median | ${S.out_med.B} | ${S.out_med.F} | F slightly lower |`,
    `| cost — mean (USD) | $${S.cost_mean.B} | $${S.cost_mean.F} | **F +${costPremiumPct}%** |`,
    `| cost — median (USD) | $${S.cost_med.B} | $${S.cost_med.F} | F higher |`,
    `| wall-clock — mean (ms) | ${S.dur_mean.B} | ${S.dur_mean.F} | – |`,
    `| cache-creation tokens | ${S.cache_create.B} | ${S.cache_create.F} | F writes a bigger system prompt |`,
    `| cache-read tokens | ${S.cache_read.B} | ${S.cache_read.F} | – |`,
    '',
    `- fablever emits **fewer** output tokens on **${out.F_fewer_output_tokens_single}** decided single-turn tasks — i.e. it is *not* a reliable token-saver.`,
    `- fablever is cheaper on **${out.F_cheaper_single}** single-turn tasks — the style block (a measured **~${styleBlock} input tokens**) makes every single-shot call cost a bit more.`,
    '',
    '## All tasks (incl. multi-turn outliers — noisier)',
    '| metric | B (plain) | F (fablever) |',
    '|---|---|---|',
    `| output tokens — mean / median | ${A.out_mean.B} / ${A.out_med.B} | ${A.out_mean.F} / ${A.out_med.F} |`,
    `| cost — mean / median (USD) | $${A.cost_mean.B} / $${A.cost_med.B} | $${A.cost_mean.F} / $${A.cost_med.F} |`,
    '',
    '## Honest reading',
    `fablever is **not** a cost or token saver. Output length is roughly neutral (it adds words on short asks, trims them on long ones), while the style block adds a fixed **~${styleBlock}-token** system-prompt overhead — so single-shot calls cost about **${costPremiumPct}% more** (cheaper on ${out.F_cheaper_single}). The honest mitigant is caching: that block is written **once per session** and then cache-*read* (~10× cheaper) on every later turn, so the per-call premium above — measured with a fresh cwd that re-writes the prompt every call — is the **worst-case** view; in a real multi-turn session the steady-state overhead is much smaller. Bottom line: a small, real, amortizing cost premium for the discipline layer — consistent with "style, not efficiency magic." Published as measured.`,
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

if (process.argv[2] === 'tasks') { fs.writeFileSync(path.join(HERE, 'tasks.jsonl'), BATTERY.map(t => JSON.stringify(t)).join('\n')); console.log(`wrote ${BATTERY.length}`); }
else if (process.argv[2] === 'gen') await generate();
else if (process.argv[2] === 'report') report();
else { await generate(); report(); }
