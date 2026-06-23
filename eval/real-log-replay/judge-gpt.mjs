// judge-gpt.mjs — Re-judge the real-log replay with GPT-5.5 (via the Codex CLI, which uses ChatGPT auth;
// the OpenAI API key itself is out of quota). This is the cross-MODEL-JUDGE robustness check the operator
// asked for: the generators are both Opus (B=plain, F=fablever-styled), the first judge was Gemini-2.5-pro,
// and this re-judges the SAME cached replies with a different-lab judge. If GPT-5.5 also prefers plain, the
// 8–2 Gemini result is judge-independent; if it flips, the original was judge-biased.
//
// Reuses raw.local/*.json (already generated) — no regeneration. Privacy: real prompts go to GPT for the
// judgment the operator requested, but only winner verdicts are written; nothing is committed (gitignored).
// Usage: node judge-gpt.mjs [judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAWDIR = path.join(HERE, 'raw.local');
const JUD = path.join(RAWDIR, 'judge-gpt');
fs.mkdirSync(JUD, { recursive: true });
const CODEX = '/Users/elon/.nvm/versions/node/v20.19.6/bin/codex';
const MODEL = 'gpt-5.5';
const CONC = 3, TIMEOUT_MS = 180000;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }

const pairPrompt = (req, A, B) => `A developer sent the REQUEST below to a coding assistant. Two assistants replied. Pick the ONE reply the developer would rather receive to make progress with the least extra work. You MUST choose A or B. Reward: directly answering the ask, correctness, a decisive well-supported answer, respecting scope, and tight writing. Penalize: unsupported "it works" claims, doing more than asked, hedging, padding, and missing the point.\n\nREQUEST:\n${req}\n\n=== REPLY A ===\n${A}\n\n=== REPLY B ===\n${B}\n\nOutput ONLY one line of JSON: {"winner":"A or B","why":"one short phrase"}`;

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }

function runCodexJudge(prompt) {
  return new Promise(resolve => {
    let cwd = '', outFile = '';
    try { cwd = fs.mkdtempSync('/tmp/gptjudge-'); outFile = path.join(cwd, 'last.txt'); } catch {}
    const done = (v) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(v); };
    let child; try {
      child = spawn(CODEX, ['exec', '-m', MODEL, '--sandbox', 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, prompt], { cwd });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => {
        clearTimeout(timer);
        let txt = ''; try { txt = fs.readFileSync(outFile, 'utf8'); } catch {}
        const o = extractJSON(txt || out, x => x.winner !== undefined);
        done(o);
      });
      child.on('error', () => { clearTimeout(timer); done(null); });
    } catch { done(null); }
  });
}
async function judgeOne(prompt) { for (let a = 0; a < 3; a++) { const v = await runCodexJudge(prompt); if (v) return v; await new Promise(z => setTimeout(z, 2000 * (a + 1))); } return null; }

function loadRaws() { return fs.readdirSync(RAWDIR).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(RAWDIR, f))).filter(r => r && r.B && r.F); }

async function judge() {
  const raws = loadRaws();
  const jobs = [];
  for (const r of raws) {
    jobs.push({ id: r.id, order: 'o1', A: 'B', B: 'F', At: r.B, Bt: r.F, req: r.prompt });
    jobs.push({ id: r.id, order: 'o2', A: 'F', B: 'B', At: r.F, Bt: r.B, req: r.prompt });
  }
  const file = j => path.join(JUD, `${j.id}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[gpt-judge] ${jobs.length} judgments, ${todo.length} to run (model ${MODEL} via codex)`); let done = 0;
  await pool(todo, CONC, async (j) => {
    const v = await judgeOne(pairPrompt(j.req, j.At, j.Bt));
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? j.B : j.A; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, order: j.order, winnerArm: w }, null, 2)); }
    done++; console.log(`[gpt-judge] ${done}/${todo.length} ${j.id}/${j.order} ${v ? '->' + v.winner : 'FAIL'}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
function report() {
  const raws = loadRaws();
  const J = {}; for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.order}`] = v; }
  let F = 0, B = 0, tie = 0, n = 0;
  for (const r of raws) { const o1 = J[`${r.id}__o1`], o2 = J[`${r.id}__o2`]; if (!o1 || !o2) continue; n++; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'F') F++; else B++; } else tie++; }
  const decided = F + B;
  const out = { judge: MODEL + ' (via codex)', n_replayed: n, F_wins: F, B_wins: B, position_bias_ties: tie, decided, F_win_pct: decided ? +(100 * F / decided).toFixed(1) : null, p: decided ? +binomTwoSided(F, decided).toFixed(4) : null, ci: wilson(F, decided) };
  fs.writeFileSync(path.join(HERE, 'results-gpt.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[2] === 'report') report();
else { await judge(); report(); }
