#!/usr/bin/env node
// eval/codex-native-ab/run.mjs — the component-A/B runner.
//
//   node run.mjs --dry-run [--json]                      print the plan; NO install, NO model call, NO writes
//   node run.mjs --codex-home=<dir> [--arms=B,A,M,H,S] [--task=<id>] [--seed=1] [--out=<dir>] [--assume-hook-trust]
//
// Execute requires a dedicated eval CODEX_HOME you logged into ONCE by hand (the runner never reads auth). For
// each task × arm it: copies the fixture into a throwaway workspace, applies the arm's fablever install
// (project scope, into the workspace), runs `codex exec --json` with a token-free env, and records the raw
// event stream + the production-file diff + the verification result. It does NOT score the unsupported-claim
// metric here — that uses the frozen oracle (oracle/, score.mjs) so the code under test is never its own judge.
// The codex binary is `$FABLE_CODEX_BIN` or `codex`, so a fake shim can drive the harness offline. Zero deps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARMS, ARM_IDS } from './lib/arms.mjs';
import { safeCodexEnv } from './lib/safe-env.mjs';
import { parseEvents } from './lib/codex-events.mjs';
import { mulberry32 } from '../../measurement/lib/stats.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '..', '..');
const INSTALL = path.join(REPO, 'install.mjs');
const CODEX_BIN = process.env.FABLE_CODEX_BIN || 'codex';

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const DRY = has('--dry-run'), JSON_OUT = has('--json');
const SEED = Number(val('seed', '1')) || 1;
const armSel = (val('arms', ARM_IDS.join(','))).split(',').map(s => s.trim()).filter(a => ARMS[a]);
const taskSel = val('task', '');
const MODEL = val('model', '');
const assumeTrust = has('--assume-hook-trust');

function loadTasks() {
  const raw = fs.readFileSync(path.join(DIR, 'tasks.jsonl'), 'utf8');
  let tasks = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  if (taskSel) { const want = new Set(taskSel.split(',')); tasks = tasks.filter(t => want.has(t.id)); }
  return tasks;
}

const codexArgs = (prompt, finalPath) => ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--sandbox', 'workspace-write', '-o', finalPath, ...(MODEL ? ['-m', MODEL] : []), prompt];
// Run the codex binary. A `.js`/`.mjs` CODEX_BIN (a fake shim, for offline harness tests) is run via node so
// it works cross-platform; a real `codex` binary is spawned directly.
const spawnCodex = (a, opts) => /\.[cm]?js$/.test(CODEX_BIN) ? spawnSync(process.execPath, [CODEX_BIN, ...a], opts) : spawnSync(CODEX_BIN, a, opts);

// ---- production-file diff (excludes harness artifacts the install itself writes) ------------------------
// Harness artifacts (the install's files + the runner's own output sinks) — never the model's edits.
// Harness artifacts live at the workspace ROOT only, so ignore is root-anchored (depth 0). A model edit to a
// NESTED file that happens to share a name (e.g. docs/final.txt, or anything under a nested dir called
// `.agents`) is a real edit and must still count — matching by basename at any depth would silently drop it.
const IGNORE_ROOT = new Set(['.codex', '.agents', 'AGENTS.md', 'AGENTS.override.md', 'node_modules', '.git', 'final.txt', 'hooktrace.jsonl']);
function listFiles(root, base = root, acc = new Map(), depth = 0) {
  let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (depth === 0 && IGNORE_ROOT.has(e.name)) continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) listFiles(p, base, acc, depth + 1);
    else { try { acc.set(path.relative(base, p), fs.readFileSync(p, 'utf8')); } catch {} }
  }
  return acc;
}
function changedFiles(fixtureDir, workspaceDir) {
  const a = listFiles(fixtureDir), b = listFiles(workspaceDir);
  const changed = [];
  for (const [f, c] of b) if (!a.has(f) || a.get(f) !== c) changed.push(f);
  for (const [f] of a) if (!b.has(f)) changed.push(f);
  return [...new Set(changed)].sort();
}

// ---- dry-run plan (read-only) ---------------------------------------------------------------------------
function plan() {
  const tasks = loadTasks();
  const order = shuffleArms(SEED);
  const p = {
    eval: 'codex-native-ab', codex_bin: CODEX_BIN, seed: SEED,
    arms: armSel.map(a => ({ id: a, label: ARMS[a].label, install: ARMS[a].installArgs ? `node install.mjs ${ARMS[a].installArgs.join(' ')}` : '(none — plain Codex)', requires_trusted_hooks: ARMS[a].requiresTrustedHooks })),
    tasks: tasks.map(t => t.id),
    arm_order_per_task: order.filter(a => armSel.includes(a)),
    total_runs: tasks.length * armSel.length,
    codex_command_template: `${CODEX_BIN} ${codexArgs('<prompt>', '<workspace>/final.txt').join(' ')}`,
    network: 'Codex model access only (the model call). No other network.',
    credentials: 'the runner inspects/copies NO auth; a token-free allowlist env is passed to the child.',
    hook_trust: 'H and S require trusted Codex hooks; the runner refuses them unless a probe confirms the hooks fired (or --assume-hook-trust for a controlled rerun).',
    scoring: 'scope_violation + acceptance_pass + unnecessary_change are computed here (path/exit based); unsupported_done_claim is scored by the FROZEN oracle in score.mjs, not by the code under test.',
    writes: 'nothing in --dry-run.',
  };
  return p;
}
function shuffleArms(seed) {
  const rng = mulberry32(seed); const a = [...ARM_IDS];
  for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- one task × arm -------------------------------------------------------------------------------------
function runOne(task, armId, evalHome, outDir) {
  const arm = ARMS[armId];
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `cab-${task.id}-${armId}-`));
  const meta = { task: task.id, domain: task.domain, arm: armId, label: arm.label, install_ok: null, hook_trust: null, codex_exit: null, changed_files: [], scope_violation: null, unnecessary_change: null, acceptance_pass: null, counts: null, usage: null, failed: null };
  try {
    fs.cpSync(path.join(DIR, task.fixture), ws, { recursive: true });
    if (arm.installArgs) {
      // Even fablever's own install + the task verification get a token-free env — no child in the harness
      // sees a secret, not just the model call.
      const r = spawnSync(process.execPath, [INSTALL, ...arm.installArgs], { cwd: ws, env: safeCodexEnv(evalHome, { HOME: evalHome }).env, encoding: 'utf8' });
      meta.install_ok = r.status === 0;
    }
    if (arm.requiresTrustedHooks) meta.hook_trust = assumeTrust ? 'assumed (--assume-hook-trust)' : 'UNVERIFIED — intention-to-treat (no probe confirmed hooks fired)';

    const prompt = fs.readFileSync(path.join(DIR, task.prompt_file), 'utf8').trim();
    const finalPath = path.join(ws, 'final.txt');
    const trace = path.join(ws, 'hooktrace.jsonl');
    const { env } = safeCodexEnv(evalHome, { FABLE_HOOK_TRACE_FILE: trace });
    const r = spawnCodex(codexArgs(prompt, finalPath), { cwd: ws, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 });
    meta.codex_exit = r.status;
    const events = String(r.stdout || '');
    const parsed = parseEvents(events);
    meta.counts = parsed.counts; meta.usage = parsed.usage; meta.failed = parsed.failed;

    const changed = changedFiles(path.join(DIR, task.fixture), ws);
    meta.changed_files = changed;
    if (task.expected_no_change) meta.unnecessary_change = changed.length > 0;
    // A change is a scope violation if it is explicitly forbidden OR not in allowed_paths. An EMPTY
    // allowed_paths means "modify nothing" (schema intent) — so any change is a violation, not a free pass.
    else meta.scope_violation = changed.some(f => (task.forbidden_paths || []).includes(f) || !(task.allowed_paths || []).includes(f));
    meta.acceptance_pass = (task.verification || []).every(argv => { const v = spawnSync(argv[0], argv.slice(1), { cwd: ws, env: safeCodexEnv(evalHome, { HOME: evalHome }).env, encoding: 'utf8' }); return v.status === 0; });

    fs.mkdirSync(path.join(outDir, task.id), { recursive: true });
    fs.writeFileSync(path.join(outDir, task.id, `${armId}.raw.jsonl`), events);
    fs.writeFileSync(path.join(outDir, task.id, `${armId}.final.txt`), (() => { try { return fs.readFileSync(finalPath, 'utf8'); } catch { return parsed.lastMessageText || ''; } })());
    fs.writeFileSync(path.join(outDir, task.id, `${armId}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
  return meta;
}

// ---- main -----------------------------------------------------------------------------------------------
if (DRY) {
  const p = plan();
  if (JSON_OUT) process.stdout.write(JSON.stringify(p, null, 2) + '\n');
  else { process.stdout.write(`[dry-run] codex-native-ab — ${p.total_runs} runs (${p.tasks.length} tasks × ${p.arms.length} arms), seed ${p.seed}\n`); for (const a of p.arms) process.stdout.write(`  arm ${a.id} (${a.label}): ${a.install}${a.requires_trusted_hooks ? '  [needs trusted hooks]' : ''}\n`); process.stdout.write(`  codex: ${p.codex_command_template}\n  network: ${p.network}\n  credentials: ${p.credentials}\n  scoring: ${p.scoring}\n  [dry-run] No install, no model call, nothing written.\n`); }
  process.exit(0);
}

const evalHome = val('codex-home', '');
if (!evalHome) { process.stderr.write('execute needs --codex-home=<dir> (the eval CODEX_HOME you logged into once). Use --dry-run to preview without it.\n'); process.exit(2); }
const outDir = val('out', path.join(DIR, 'out'));
const tasks = loadTasks();
const order = shuffleArms(SEED).filter(a => armSel.includes(a));
const results = [];
for (const task of tasks) for (const armId of order) results.push(runOne(task, armId, evalHome, outDir));
process.stdout.write(`Wrote ${results.length} run(s) to ${outDir}\n`);
if (JSON_OUT) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
