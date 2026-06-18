// Axis A coding-headline runner. Solves staged tasks headlessly under one condition, scores via the
// committed oracle. Pinned model + neutral prompt; A0 neutralizes the fablever layer, A1 leaves it on.
// Usage: COND=A0 KK=3 TASKS=C1-bugfix,... OUT=/path node cmp-run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = '/Users/elon/work/fable-profile';
const BF = path.join(REPO, 'eval/comparison/tasks/coding/build-fixtures.mjs');
const MODEL = 'claude-haiku-4-5-20251001';
const COND = process.env.COND || 'A0';
const KK = parseInt(process.env.KK || '3', 10);
const OUT = process.env.OUT || `/tmp/cmp-${COND}`;
const ALL = ['C1-bugfix','C2-flatten','C3-safety','C4-feature','C5-diagnose','C6-edgecase','C7-bounds','C8-async','C9-parse'];
const TASKS = (process.env.TASKS ? process.env.TASKS.split(',') : ALL).map(s => s.trim());

const PROMPT = 'Read PROMPT.txt in this directory and implement the requested change by editing the existing JavaScript source file here. Edit only that existing file; do not create any new files. Then stop.';

function log(m) { process.stdout.write(m + '\n'); }
function stage(dir) { spawnSync('node', [BF, 'stage', dir], { encoding: 'utf8' }); }

function solve(taskDir) {
  const env = { ...process.env, CLAUDE_NO_SUMMARIZE: '1' };
  const args = ['-p', PROMPT, '--model', MODEL, '--permission-mode', 'acceptEdits'];
  if (COND === 'A0') { env.FABLE_PROFILE = 'off'; args.push('--settings', '{"outputStyle":"default"}'); }
  const r = spawnSync('claude', args, { cwd: taskDir, env, encoding: 'utf8', timeout: 240000 });
  const ms = parseInt(process.env.DELAY_MS || '0', 10);
  if (ms) spawnSync('sleep', [String(ms / 1000)]);
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

// score one staged tree -> map id->bool by re-running the committed oracle (clean temp dir)
function scoreTree(dir) {
  const r = spawnSync('node', [BF, 'score', dir], { encoding: 'utf8' });
  const m = {};
  for (const line of (r.stdout || '').split('\n')) {
    const mt = line.match(/^(PASS|FAIL)\s+(\S+)/);
    if (mt) m[mt[2]] = mt[1] === 'PASS';
  }
  return m;
}

const results = {}; // task -> [bool per k]
for (const t of TASKS) results[t] = [];

fs.mkdirSync(OUT, { recursive: true });
const started = Date.now();
for (let k = 1; k <= KK; k++) {
  const kdir = path.join(OUT, `k${k}`);
  stage(kdir);
  for (const t of TASKS) {
    const td = path.join(kdir, t);
    const t0 = Date.now();
    const { out, status } = solve(td);
    fs.writeFileSync(path.join(td, '_solver.log'), out);
    log(`[${COND} k${k}] ${t} solved status=${status} ${Math.round((Date.now()-t0)/1000)}s`);
  }
  const scored = scoreTree(kdir);
  for (const t of TASKS) results[t].push(!!scored[t]);
  log(`[${COND} k${k}] scored: ` + TASKS.map(t => `${t}=${scored[t] ? 'P' : 'F'}`).join(' '));
}

const summary = {};
for (const t of TASKS) {
  const arr = results[t];
  summary[t] = { passes: arr.filter(Boolean).length, k: arr.length, runs: arr };
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ cond: COND, model: MODEL, kk: KK, summary, elapsed_s: Math.round((Date.now()-started)/1000) }, null, 2));
log('\n=== ' + COND + ' SUMMARY (pass/k) ===');
for (const t of TASKS) log(`${t}: ${summary[t].passes}/${summary[t].k}`);
log('wrote ' + path.join(OUT, 'results.json'));
