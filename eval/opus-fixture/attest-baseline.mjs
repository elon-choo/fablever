#!/usr/bin/env node
// attest-baseline.mjs — G0.2 one-shot Opus baseline attestation (the fixture's non-triviality proof).
//
//   node eval/opus-fixture/attest-baseline.mjs --budget-confirmed=<owner-ref> [--out=<dir>]
//
// WHY this exists: the deterministic scaffold proxy in validate.mjs only proves "doing nothing fails" —
// it cannot prove the tasks are HARD. If plain one-shot Opus already passes every hidden oracle, the
// fixture has no headroom and the G3.6 A/B cannot discriminate between arms; the honest response then is
// to harden the tasks and re-freeze, NOT to run the A/B. This script produces that evidence by running the
// EXACT plain-opus arm the A/B harness uses (no Fable style, no stop gate, no loop) once per task, scoring
// with the hidden oracles the arm never sees, and recording pass/fail per task.
//
// Spends real Opus tokens (one session per task) — hence the explicit owner-budget flag, matching the
// harness's fail-closed discipline. Writes _oracle/non-triviality-attestation.json.
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = path.join(DIR, 'tasks');
const ORACLE_DIR = path.join(DIR, '_oracle');
const ATTESTATION = path.join(ORACLE_DIR, 'non-triviality-attestation.json');

const argv = process.argv.slice(2);
const val = name => { const a = argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; };
const budgetRef = val('budget-confirmed');
if (!budgetRef.trim()) {
  process.stderr.write('attest-baseline: refusing — this spends real Opus tokens.\n  need --budget-confirmed=<owner-attestation-ref>\n');
  process.exit(2);
}

const claudeBin = process.env.FABLE_CLAUDE_BIN || 'claude';
const model = process.env.FABLE_OPUS_MODEL || 'claude-opus-4-8';
const tasks = readdirSync(TASKS_DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();

// The plain-opus arm, byte-for-byte as eval/verified-loop-ab/opus-arm-runner.mjs builds it: default output
// style, no stop gate, FABLE_PROFILE=off, and no shell/search tools (the model edits files only).
function runPlainOpus(prompt, workspace) {
  const args = [
    '-p', prompt,
    '--model', model,
    '--output-format', 'json',
    '--permission-mode', 'bypassPermissions',
    '--tools', 'Read,Edit,Write',
    '--allowedTools', 'Read,Edit,Write',
    '--disallowedTools', 'Bash,Glob,Grep,WebFetch,WebSearch,Task',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--no-chrome',
    '--settings', JSON.stringify({ outputStyle: 'default' }),
  ];
  const command = /\.[cm]?js$/i.test(claudeBin) ? process.execPath : claudeBin;
  const commandArgs = command === process.execPath ? [claudeBin, ...args] : args;
  const started = process.hrtime.bigint();
  const r = spawnSync(command, commandArgs, {
    cwd: workspace, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, CLAUDE_NO_SUMMARIZE: '1', FABLE_PROFILE: 'off' },
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  let usage = null;
  try { const j = JSON.parse(r.stdout || '{}'); usage = j.usage || j.total_cost_usd != null ? { usage: j.usage, cost_usd: j.total_cost_usd } : null; } catch { /* keep null */ }
  return { status: r.status, wallMs, usage, error: r.error ? String(r.error.message || r.error) : null };
}

// Score with the hidden oracles the arm never saw. failed = ANY oracle non-zero.
function scoreTask(task, solutionDir) {
  const checks = readdirSync(path.join(ORACLE_DIR, task)).filter(f => /^check\d+\.mjs$/.test(f)).sort();
  const per = {};
  let failed = false;
  for (const c of checks) {
    const r = spawnSync(process.execPath, [path.join(ORACLE_DIR, task, c), solutionDir], { encoding: 'utf8', timeout: 60_000 });
    const pass = r.status === 0;
    per[c] = pass ? 'pass' : 'fail';
    if (!pass) failed = true;
  }
  return { failed, checks: per };
}

const root = mkdtempSync(path.join(tmpdir(), 'opus-attest-'));
const results = {};
let failedCount = 0;
try {
  for (const task of tasks) {
    const ws = path.join(root, task);
    mkdirSync(ws, { recursive: true });
    // ARM-VISIBLE bundle only, laid out EXACTLY as eval/verified-loop-ab/run.mjs does it (prompt.md at the
    // workspace root, the scaffold under `scaffold/`) — the prompts say "implement … in scaffold/<file>.mjs",
    // so flattening the scaffold into the root makes the arm edit a path the oracle never reads and every
    // task fails for a harness reason rather than a task-difficulty reason.
    cpSync(path.join(TASKS_DIR, task, 'prompt.md'), path.join(ws, 'prompt.md'));
    cpSync(path.join(TASKS_DIR, task, 'scaffold'), path.join(ws, 'scaffold'), { recursive: true });
    const solutionDir = path.join(ws, 'scaffold');
    const prompt = readFileSync(path.join(TASKS_DIR, task, 'prompt.md'), 'utf8').trim();
    process.stdout.write(`\n[${task}] running plain one-shot Opus (${model})…\n`);
    const run = runPlainOpus(prompt, ws);
    const score = scoreTask(task, solutionDir);
    if (score.failed) failedCount++;
    results[task] = {
      failed: score.failed,
      checks: score.checks,
      exit: run.status,
      wall_clock_ms: Math.round(run.wallMs),
      usage: run.usage,
      spawn_error: run.error,
    };
    process.stdout.write(`  → ${score.failed ? 'FAIL (task has headroom)' : 'PASS (task is saturated — no headroom)'}  ${JSON.stringify(score.checks)}\n`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const attestation = {
  schema_version: 1,
  recorded_at: new Date().toISOString(),
  model,
  arm: 'plain-opus (one-shot, no Fable style, no stop gate, no loop) — identical invocation to the G3.6 harness arm',
  budget_confirmed_ref: budgetRef,
  fixture_sha256: readFileSync(path.join(DIR, 'FIXTURE-HASH.txt'), 'utf8').trim(),
  one_shot_baseline: results,
  failed_task_count: failedCount,
  total_tasks: tasks.length,
  note: 'failed:true = one-shot Opus did NOT pass every hidden oracle for that task = the task has headroom for the A/B to measure. If failed_task_count is below the fixture floor, the fixture is saturated and MUST be hardened + re-frozen before G3.6 runs — publishing an A/B on a saturated fixture would measure nothing.',
};
writeFileSync(ATTESTATION, JSON.stringify(attestation, null, 2) + '\n');
process.stdout.write(`\nattestation written: ${ATTESTATION}\n  one-shot Opus FAILED ${failedCount}/${tasks.length} tasks\n`);
process.exit(0);
