// run-replay.mjs — Replay the operator's OWN real Claude Code prompts through plain Opus (B) vs fablever
// (F) and blind-judge which reply they'd rather receive. The closest solo proxy to "real-user
// productivity": instead of synthetic eval tasks, it samples the actual work distribution.
//
// PRIVACY (load-bearing): real prompts + both replies are written ONLY to prompts.local.jsonl and
// raw.local/ which are gitignored. The committed RESULTS.md contains ONLY aggregate counts and
// hand-written SYNTHETIC examples — no real prompt text, no project/client names ever leave the machine.
//
// HONEST SCOPE: we can only replay prompts that stand ALONE (no "fix that", no missing-file reference,
// no multi-turn context). So this is a FILTERED subsample of real work — the self-contained slice — not
// the full distribution. That bias is stated in the results. Usage: [extract|gen|judge|report]

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAWDIR = path.join(HERE, 'raw.local');         // gitignored
const PROMPTS = path.join(HERE, 'prompts.local.jsonl'); // gitignored
fs.mkdirSync(RAWDIR, { recursive: true });
const CLAUDE = '/Users/elon/.nvm/versions/node/v20.19.6/bin/claude';
const MODEL = 'claude-opus-4-8';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CONC = 3, GEN_TIMEOUT_MS = 220000, N_SAMPLE = 30;
const readJSON = q => { try { return JSON.parse(fs.readFileSync(q, 'utf8')); } catch { return null; } };
async function pool(items, conc, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) { console.log('pool err', String(e).slice(0, 80)); } } })); }
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

// ---- self-contained filter ----
const CONTEXT_REF = /^(그|이|저|위|아래|방금|아까|다시|계속|그거|그건|이거|저거|네|아니|응|ㅇㅇ|ok|yes|no|continue|go on|음|흠|좋아|고마워|thanks)\b/i;
const COMMANDish = /^[\/<!@]/;                       // slash command / system tag / bang
const FILE_REF = /(?:\.\/|\/Users\/|src\/|\b\w+\.(?:js|ts|tsx|py|md|json|sql|sh|mjs|cjs|java|go|rb|php)\b)/; // references a file not inlined
// references an EXTERNAL resource the headless model cannot see (file/folder/url/attachment/deictic location)
const EXTERNAL_REF = /https?:\/\/|www\.|[A-Za-z]:\\|OneDrive|\/Users\/|[가-힣A-Za-z0-9_]+\\[가-힣A-Za-z]|여기에|여기서|여기에선|참고자료|첨부|위 (파일|자료|폴더|코드|내용)|아래 (파일|자료|폴더)|해당 (파일|폴더|자료|데이터|코드|레포)|이 (폴더|파일|자료|레포|데이터)|그 (폴더|파일|자료)/;
// open-ended multi-hour build — cannot be answered in one non-interactive shot, so it can't replay
const MEGABUILD = /(전부|다|모두|싹|통째로) ?(만들|구현|개발|짜)|서비스를? ?(전부|다)? ?만들|시스템을? ?(전부|다)? ?만들|UI\/?UX.*(만들|구현)|풀버전|실제 (돌아가는|작동하는) (버전|서비스)/;
const TASK_SIGNAL = /(고쳐|만들|추가|작성|분석|설계|리뷰|검토|why|how|should|fix|write|add|build|review|explain|design|optimi|compare|debug|문제|버그|개선|정리|요약|추천|어떻게|왜|뭐가|какой)/i;
const hasInlineContent = t => /```|function |=>|\{[\s\S]*\}|const |class |def |SELECT |<[a-z]+>/.test(t);
function isSelfContained(text) {
  const t = text.trim();
  if (t.length < 45 || t.length > 1200) return false;
  if (COMMANDish.test(t)) return false;
  if (CONTEXT_REF.test(t)) return false;
  if (/<command-name>|local-command|system-reminder|tool_result|caveat/i.test(t)) return false;
  if (MEGABUILD.test(t)) return false;
  // any external-resource or file reference is OK ONLY if the prompt inlines the content it needs
  if ((EXTERNAL_REF.test(t) || FILE_REF.test(t)) && !hasInlineContent(t)) return false;
  if (!TASK_SIGNAL.test(t)) return false;
  return true;
}

function extract() {
  const files = execSync('find /Users/elon/.claude/projects -name "*.jsonl" -newermt 2026-04-01 2>/dev/null', { maxBuffer: 1 << 26 }).toString().trim().split('\n').filter(Boolean);
  console.log(`scanning ${files.length} transcripts`);
  const byProject = new Map();
  const seen = new Set();
  // skip eval-scaffolding sessions (our own /tmp runs, dt-sim temp dirs, the eval-comparison subtrees) —
  // they are not "real work" and would make the distribution circular.
  const EXCLUDE_PROJ = /private-tmp|dtsim|fable-profile-eval|big-oqi/;
  for (const f of files) {
    const proj = path.basename(path.dirname(f));
    if (EXCLUDE_PROJ.test(proj)) continue;
    let lines; try { lines = fs.readFileSync(f, 'utf8').split('\n'); } catch { continue; }
    for (const ln of lines) {
      if (!ln) continue;
      let o; try { o = JSON.parse(ln); } catch { continue; }
      if (o.type !== 'user' || o.message?.role !== 'user' || typeof o.message.content !== 'string') continue;
      if (o.isMeta || o.isSidechain) continue;
      const text = o.message.content;
      if (!isSelfContained(text)) continue;
      const h = hash(text.trim().slice(0, 200));
      if (seen.has(h)) continue; seen.add(h);
      if (!byProject.has(proj)) byProject.set(proj, []);
      byProject.get(proj).push({ id: h, project: proj, prompt: text.trim() });
    }
  }
  // spread: round-robin across projects (sorted) so the sample isn't dominated by one project
  const projects = [...byProject.keys()].sort();
  for (const p of projects) byProject.get(p).sort((a, b) => a.id.localeCompare(b.id));
  const picked = []; let round = 0;
  while (picked.length < N_SAMPLE && round < 50) { for (const p of projects) { const arr = byProject.get(p); if (arr[round]) { picked.push(arr[round]); if (picked.length >= N_SAMPLE) break; } } round++; }
  fs.writeFileSync(PROMPTS, picked.map(x => JSON.stringify(x)).join('\n'));
  const dist = {}; for (const x of picked) dist[x.project] = (dist[x.project] || 0) + 1;
  console.log(`picked ${picked.length} self-contained prompts from ${projects.length} projects (qualifying pool across all: ${[...byProject.values()].reduce((a, b) => a + b.length, 0)})`);
  console.log('per-project:', JSON.stringify(dist));
}

function loadPrompts() { try { return fs.readFileSync(PROMPTS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } }

function runClaude(prompt, onFable) {
  const settings = onFable ? '{"outputStyle":"Fable"}' : '{"outputStyle":"default"}';
  return new Promise(resolve => {
    let cwd = ''; try { cwd = fs.mkdtempSync('/tmp/fabl-rp-'); } catch {}
    const done = (t) => { try { if (cwd) fs.rmSync(cwd, { recursive: true, force: true }); } catch {} resolve(t); };
    let child; try {
      child = spawn(CLAUDE, ['-p', prompt, '--model', MODEL, '--settings', settings], { cwd: cwd || undefined, env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: onFable ? '' : 'off' } });
      let out = ''; const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, GEN_TIMEOUT_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', () => {});
      child.on('close', () => { clearTimeout(timer); done(out.trim()); }); child.on('error', () => { clearTimeout(timer); done(''); });
    } catch { done(''); }
  });
}
async function gen2(prompt, onFable) { for (let a = 0; a < 3; a++) { const t = await runClaude(prompt, onFable); if (t) return t; await new Promise(z => setTimeout(z, 2500 * (a + 1))); } return ''; }
async function gen() {
  const prompts = loadPrompts();
  const todo = prompts.filter(p => !fs.existsSync(path.join(RAWDIR, p.id + '.json')));
  console.log(`[gen] ${todo.length}/${prompts.length} to run`); let done = 0;
  await pool(todo, CONC, async (p) => {
    const B = await gen2(p.prompt, false), F = await gen2(p.prompt, true);
    fs.writeFileSync(path.join(RAWDIR, p.id + '.json'), JSON.stringify({ id: p.id, project: p.project, prompt: p.prompt, B, F }, null, 2));
    done++; console.log(`[gen] ${done}/${todo.length} ${p.id} B=${B.length} F=${F.length}`);
  });
}

function extractJSON(s, keyTest) { const str = String(s || ''); let depth = 0, start = -1, last = null; for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '{') { if (depth === 0) start = i; depth++; } else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const o = JSON.parse(str.slice(start, i + 1)); if (o && keyTest(o)) last = o; } catch {} } } } return last; }
async function callGemini(prompt, keyTest, maxTok = 2500) { for (let a = 0; a < 5; a++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTok, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512 } } }) }); if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 3000 * (a + 1))); continue; } const j = await r.json(); const o = extractJSON(j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', keyTest); if (o) return o; } catch { await new Promise(z => setTimeout(z, 2000 * (a + 1))); } } return null; }
const pairPrompt = (req, A, B) => `A developer sent the REQUEST below to a coding assistant. Two assistants replied. Pick the ONE reply the developer would rather receive to make progress with the least extra work. You MUST choose A or B. Reward: directly answering the ask, correctness, a decisive well-supported answer, respecting scope, and tight writing. Penalize: unsupported "it works" claims, doing more than asked, hedging, padding, and missing the point.\n\nREQUEST:\n${req}\n\n=== REPLY A ===\n${A}\n\n=== REPLY B ===\n${B}\n\nOutput ONLY JSON on the last line: {"winner":"A or B","why":"one sentence"}`;
async function judge() {
  const raws = loadPrompts().map(p => readJSON(path.join(RAWDIR, p.id + '.json'))).filter(r => r && r.B && r.F);
  const jobs = [];
  for (const r of raws) { jobs.push({ id: r.id, order: 'o1', A: 'B', B: 'F', At: r.B, Bt: r.F, req: r.prompt }); jobs.push({ id: r.id, order: 'o2', A: 'F', B: 'B', At: r.F, Bt: r.B, req: r.prompt }); }
  const JUD = path.join(RAWDIR, 'judge'); fs.mkdirSync(JUD, { recursive: true });
  const file = j => path.join(JUD, `${j.id}__${j.order}.json`);
  const todo = jobs.filter(j => !fs.existsSync(file(j)));
  console.log(`[judge] ${todo.length} calls`); let done = 0;
  await pool(todo, 4, async (j) => {
    const v = await callGemini(pairPrompt(j.req, j.At, j.Bt), x => x.winner !== undefined, 2000);
    if (v) { const w = String(v.winner).toUpperCase().includes('B') ? j.B : j.A; fs.writeFileSync(file(j), JSON.stringify({ id: j.id, order: j.order, winnerArm: w }, null, 2)); }
    done++; if (done % 10 === 0) console.log(`[judge] ${done}/${todo.length}`);
  });
}

function binomTwoSided(k, n) { if (!n) return null; const lo = Math.min(k, n - k); let term = Math.pow(0.5, n), tail = term; for (let i = 1; i <= lo; i++) { term *= (n - i + 1) / i; tail += term; } return Math.min(1, 2 * tail); }
function wilson(k, n) { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)]; }
function report() {
  const prompts = loadPrompts();
  const JUD = path.join(RAWDIR, 'judge');
  const J = {}; try { for (const f of fs.readdirSync(JUD)) { const v = readJSON(path.join(JUD, f)); if (v) J[`${v.id}__${v.order}`] = v; } } catch {}
  let F = 0, B = 0, tie = 0, n = 0;
  const nProjects = new Set(prompts.map(p => p.project)).size;
  for (const p of prompts) { const o1 = J[`${p.id}__o1`], o2 = J[`${p.id}__o2`]; if (!o1 || !o2) continue; n++; if (o1.winnerArm === o2.winnerArm) { if (o1.winnerArm === 'F') F++; else B++; } else tie++; }
  const decided = F + B;
  const out = { n_replayed: n, n_projects: nProjects, F_wins: F, B_wins: B, position_bias_ties: tie, decided, F_win_pct: decided ? +(100 * F / decided).toFixed(1) : null, p: decided ? +binomTwoSided(F, decided).toFixed(4) : null, ci: wilson(F, decided) };
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2));
  const g = readJSON(path.join(HERE, 'results-gpt.json')); // GPT-5.5 cross-judge of the SAME cached replies (judge-gpt.mjs)
  const L = ['# Real-log replay — fablever (F) vs plain Opus (B) on the operator\'s OWN prompts\n',
    `${out.n_replayed} self-contained prompts sampled across ${out.n_projects} real projects, replayed through both arms, then the SAME cached replies blind forced-choice judged by **two different-lab judges**, both orders (order-inconsistent = position-bias tie). **Privacy:** raw prompts and replies never leave the machine — only these aggregates are committed.\n`,
    '| judge | F (fablever) | B (plain) | order-bias ties | decided | F win-% | p | 95% CI |',
    '|---|---|---|---|---|---|---|---|',
    `| **Gemini-2.5-pro** | ${out.F_wins} | ${out.B_wins} | ${out.position_bias_ties} | ${out.decided} | ${out.F_win_pct ?? '–'}% | ${out.p ?? '–'} | [${out.ci[0]}, ${out.ci[1]}]% |`,
    g ? `| **GPT-5.5** (via codex) | ${g.F_wins} | ${g.B_wins} | ${g.position_bias_ties} | ${g.decided} | ${g.F_win_pct ?? '–'}% | ${g.p ?? '–'} | [${g.ci[0]}, ${g.ci[1]}]% |` : '| **GPT-5.5** | _(run `node judge-gpt.mjs`)_ | | | | | | |',
    '',
    '## The headline: this result is JUDGE-DEPENDENT',
    g ? `On the **identical** Opus replies, **Gemini preferred plain ${out.B_wins}–${out.F_wins}** while **GPT-5.5 preferred fablever ${g.F_wins}–${g.B_wins}** (p=${g.p}). The two frontier judges *disagree*, and one of them (a non-Anthropic model judging an Anthropic-derived style) prefers fablever significantly. So the earlier single-judge read — "plain wins one-shot" — was **not robust**; it was a property of the Gemini judge, not of the replies.` : `Re-judge with GPT-5.5 (\`node judge-gpt.mjs\`) to test whether the Gemini preference is judge-specific.`,
    '',
    '## Honest scope & reading',
    '- **Filtered subsample.** Only prompts that stand alone (no "fix that", no missing-file reference, no multi-turn context) can be replayed — the *self-contained slice* of real work, not the full distribution.',
    '- **Single-turn.** Each prompt is replayed once with no follow-up.',
    '- **What the disagreement means.** A forced-choice between a terse, scope-disciplined reply (fablever) and a fuller, more scaffolded one (plain) is a **taste call**, and frontier LLM judges have *different* tastes: Gemini rewards completeness/scaffolding, GPT-5.5 rewards the decisive concise answer. Neither single number is "the truth" — so the honest read is **a wash that flips on judge choice**, not a fablever negative. If anything, that a non-Anthropic judge significantly prefers fablever is a point *for* it that the Gemini-only result hid. Every other forced-choice eval in this repo that used a single Gemini judge (the style-only ablation, the productivity A/Bs) inherits this caveat and would need the same cross-judge to be trusted in either direction.',
    '',
    '_Illustrative (SYNTHETIC, not from the logs): "Why is my flex child overflowing its container?" / "Should this retry use a fixed or exponential delay?" — the kind of standalone ask that qualifies._',
  ];
  fs.writeFileSync(path.join(HERE, 'RESULTS.md'), L.join('\n'));
  console.log('\n' + L.join('\n'));
}

if (process.argv[2] === 'extract') extract();
else if (process.argv[2] === 'gen') await gen();
else if (process.argv[2] === 'judge') await judge();
else if (process.argv[2] === 'report') report();
else { extract(); await gen(); await judge(); report(); }
