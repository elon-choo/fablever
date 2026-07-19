#!/usr/bin/env node
// eval/codex-native-ab/run.mjs — the component-A/B runner.
//
//   node run.mjs --dry-run [--json]                      print the plan; NO install, NO model call, NO writes
//   node run.mjs --codex-home=<dir> [--arms=B,A,M,H,S] [--task=<id>] [--seed=1] [--out=<dir>]
//                [--require-hook-exemption --hook-exemption-event=<redacted-captured-SubagentStart.json>]
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
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ARMS, ARM_IDS } from './lib/arms.mjs';
import { safeCodexEnv } from './lib/safe-env.mjs';
import { parseEvents } from './lib/codex-events.mjs';
import { fixtureSha256 } from './cost-report.mjs';
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
// The legacy flag remains a CLI compatibility alias, but no longer bypasses verification. Both names run
// the same bidirectional behavioral probe before any H/S/F arm starts.
const legacyAssumeTrust = has('--assume-hook-trust');
const requireHookExemption = has('--require-hook-exemption') || legacyAssumeTrust;
const hookExemptionEvent = val('hook-exemption-event', '');
const requireTrust = has('--require-hook-trust');  // DROP an H/S run whose hooks did not actually fire
// Pass Codex's --dangerously-bypass-hook-trust so the H/S project hooks actually fire under `codex exec`
// (interactive /hooks trust does not carry to the throwaway per-task workspaces). Safe here: the hooks are
// fablever's own, vetted, zero-content, fail-open. The trace gate still VERIFIES they fired.
const trustHooks = has('--trust-hooks');

function loadTasks() {
  const tasksFile = val('tasks', 'tasks.jsonl');               // --tasks=<file> to run a different task set
  // Resolve relative to the cwd the user typed it from, else relative to this eval dir; absolute wins.
  const cands = [path.resolve(process.cwd(), tasksFile), path.resolve(DIR, tasksFile)];
  const file = cands.find(c => { try { return fs.existsSync(c); } catch { return false; } }) || cands[1];
  const raw = fs.readFileSync(file, 'utf8');
  let tasks = raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  if (taskSel) { const want = new Set(taskSel.split(',')); tasks = tasks.filter(t => want.has(t.id)); }
  return tasks;
}

const codexArgs = (prompt, finalPath, inject = []) => ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--sandbox', 'workspace-write', ...inject, ...(trustHooks ? ['--dangerously-bypass-hook-trust'] : []), '-o', finalPath, ...(MODEL ? ['-m', MODEL] : []), prompt];
// Run the codex binary. A `.js`/`.mjs` CODEX_BIN (a fake shim, for offline harness tests) is run via node so
// it works cross-platform; a real `codex` binary is spawned directly.
const spawnCodex = (a, opts) => /\.[cm]?js$/.test(CODEX_BIN) ? spawnSync(process.execPath, [CODEX_BIN, ...a], opts) : spawnSync(CODEX_BIN, a, opts);

// Checked hook-exemption precondition. The caller supplies a REDACTED event captured from a real Codex
// SubagentStart hook invocation; this pins the live payload key instead of trusting a guessed boolean. We then
// perform a temporary project install, verify its effective hooks.json registration, and execute THAT installed
// hook. Empty exempt output alone is insufficient, so a normal-role control must emit a sentinel payload.
function checkHookExemption(evalHome) {
  if (!hookExemptionEvent) return { ok: false, reason: 'missing --hook-exemption-event=<redacted captured SubagentStart JSON>' };
  const eventFile = path.resolve(process.cwd(), hookExemptionEvent);
  let eventRaw, captured;
  try { eventRaw = fs.readFileSync(eventFile, 'utf8'); captured = JSON.parse(eventRaw); }
  catch (error) { return { ok: false, reason: `cannot read captured SubagentStart event: ${error.message}` }; }
  if (!captured || captured.hook_event_name !== 'SubagentStart') return { ok: false, reason: 'captured event is not hook_event_name=SubagentStart' };
  const canonicalRoles = ['red-team-validator', 'evidence-verifier', 'purple-team-arbiter'];
  if (typeof captured.agent_type !== 'string' || !canonicalRoles.includes(captured.agent_type)) {
    return { ok: false, reason: 'captured event does not pin Codex agent_type to a canonical exempt role' };
  }

  const preflight = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-hook-exemption-'));
  const sentinel = 'FABLE_HOOK_EXEMPTION_PROBE_SENTINEL';
  try {
    const install = spawnSync(process.execPath, [
      INSTALL, '--codex-full', '--codex-scope=project', '--no-codex-agents', '--no-codex-mcp', '--no-codex-skills',
    ], { cwd: preflight, env: safeCodexEnv(evalHome, { HOME: evalHome }).env, encoding: 'utf8' });
    if (install.error || install.status !== 0) return { ok: false, reason: `temporary hook install failed (status ${install.status})` };

    const probe = path.join(preflight, '.codex', 'hooks', 'fable-subagent.js');
    const hooksFile = path.join(preflight, '.codex', 'hooks.json');
    const profile = path.join(preflight, '.codex', 'fable-profile');
    if (!fs.existsSync(probe)) return { ok: false, reason: 'temporary install did not produce the effective SubagentStart hook' };
    let hooks; try { hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8')); } catch { return { ok: false, reason: 'temporary install did not produce valid hooks.json' }; }
    const registered = (hooks?.hooks?.SubagentStart || []).some(entry => entry?.matcher === '*' && (entry.hooks || []).some(hook => String(hook?.command || '').includes(probe)));
    if (!registered) return { ok: false, reason: 'effective hooks.json does not register the installed SubagentStart hook' };

    fs.writeFileSync(path.join(profile, 'compact.md'), sentinel + '\n');
    const { env } = safeCodexEnv(evalHome, { FABLE_PROFILE_HOME: profile });
    const run = event => spawnSync(process.execPath, [probe], {
      input: JSON.stringify(event),
      env, encoding: 'utf8', timeout: 10_000,
    });
    for (const role of canonicalRoles) {
      const exempt = run({ ...captured, agent_type: role });
      if (exempt.error || exempt.status !== 0) return { ok: false, reason: `exempt-role probe failed for ${role} (status ${exempt.status})` };
      if (String(exempt.stdout || '').trim()) return { ok: false, reason: `exempt role still received the restraint payload: ${role}` };
    }

    const control = run({ ...captured, agent_type: 'general-purpose' });
    if (control.error || control.status !== 0) return { ok: false, reason: `ordinary-role control failed (status ${control.status})` };
    let payload; try { payload = JSON.parse(String(control.stdout || '')); } catch { return { ok: false, reason: 'ordinary-role control did not emit valid hook JSON' }; }
    if (payload?.hookSpecificOutput?.hookEventName !== 'SubagentStart' || payload?.hookSpecificOutput?.additionalContext !== sentinel) {
      return { ok: false, reason: 'ordinary-role control did not emit the sentinel restraint payload' };
    }
    return { ok: true, event_sha256: createHash('sha256').update(eventRaw).digest('hex') };
  } finally {
    fs.rmSync(preflight, { recursive: true, force: true });
  }
}

// The compact Fable working-style reminder, delivered as developer-role context via `-c developer_instructions`
// for arms whose hook layer cannot fire under `codex exec` (the exec equivalent of the SessionStart/reinject
// hook — verified to land in the developer message via `codex debug prompt-input`).
const FABLE_DEV_LINE = 'Fable working style: act when you have enough — recommend, do not survey; lead with the outcome; do not over-build; respect the exact scope asked; ground every done/works/fixed claim in a tool/file/test result on the same line, else say "not verified"; when only asked, report and stop; stop only when truly blocked. Safety and explicit user/project instructions outrank decisiveness.';
// Tool-use directive (arm F only): the passive stack rarely triggers the fable MCP tools (1/60 in §3). This
// explicitly directs their use, to measure whether DIRECTING tool use adds value over the passive surfaces.
const FABLE_TOOLUSE_LINE = 'Before you finish, call the fable_lint MCP tool on your final user-facing message and fix anything it flags; for a substantive deliverable also call fable_check and treat a BLOCK as a stop.';
// Build the per-arm top-priority `-c` overrides that activate the surfaces a project-scope install writes but
// `codex exec` never loads from <ws>/.codex/ (confirmed: untrusted ephemeral cwd + --ignore-user-config).
// `-c` is a config layer ABOVE the user-config file, so it applies even with --ignore-user-config, per-arm,
// without dropping isolation. `ws` is the per-task workspace; the project install already put server.js there.
function injectArgs(arm, ws) {
  const inj = [];
  if (arm.mcp) {
    const home = path.join(ws, '.codex', 'fable-profile');
    const srv = path.join(home, 'runtime', 'mcp', 'src', 'server.js');
    inj.push(
      '-c', 'mcp_servers.fable-profile.command="node"',
      '-c', `mcp_servers.fable-profile.args=[${JSON.stringify(srv)}]`,
      '-c', 'mcp_servers.fable-profile.env.FABLE_HOST="codex"',
      '-c', `mcp_servers.fable-profile.env.FABLE_PROFILE_HOME=${JSON.stringify(home)}`,
      '-c', `mcp_servers.fable-profile.env.FABLE_HOME=${JSON.stringify(path.join(home, 'runtime'))}`,
      '-c', `mcp_servers.fable-profile.env.FABLE_TASTE_FILE=${JSON.stringify(path.join(home, 'taste.json'))}`,
      // "approve" auto-authorizes the fable_* tools; "auto"/"never" are CANCELLED under non-interactive exec.
      '-c', 'mcp_servers.fable-profile.default_tools_approval_mode="approve"',
      '-c', 'mcp_servers.fable-profile.startup_timeout_sec=10',
      '-c', 'mcp_servers.fable-profile.tool_timeout_sec=60',
    );
  }
  if (arm.injectStyle || arm.injectToolUse) {
    const dev = [arm.injectStyle ? FABLE_DEV_LINE : '', arm.injectToolUse ? FABLE_TOOLUSE_LINE : ''].filter(Boolean).join(' ');
    inj.push('-c', `developer_instructions=${JSON.stringify(dev)}`);
  }
  return inj;
}

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
    hook_trust: `H/S/F hook exemption can be checked before any arm starts with --require-hook-exemption plus --hook-exemption-event=<redacted captured SubagentStart JSON> (legacy --assume-hook-trust is a checked alias, never a bypass). Pass --trust-hooks (adds Codex's --dangerously-bypass-hook-trust, vetted fablever hooks only) so native hooks can fire; --require-hook-trust retains the per-run trace check.${trustHooks ? '  [--trust-hooks ON]' : ''}${requireHookExemption ? '  [exemption preflight ON]' : ''}`,
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
function runOne(task, armId, evalHome, outDir, exemptionPreflight) {
  const arm = ARMS[armId];
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `cab-${task.id}-${armId}-`));
  const meta = { task: task.id, domain: task.domain, arm: armId, label: arm.label, install_ok: null, hook_trust: null, hook_exemption_preflight: exemptionPreflight, codex_exit: null, wall_clock_ms: null, fixture_sha256: null, changed_files: [], scope_violation: null, unnecessary_change: null, acceptance_pass: null, counts: null, usage: null, failed: null };
  try {
    const fixtureDir = path.join(DIR, task.fixture);
    meta.fixture_sha256 = fixtureSha256(fixtureDir);
    fs.cpSync(fixtureDir, ws, { recursive: true });
    if (arm.installArgs) {
      // Even fablever's own install + the task verification get a token-free env — no child in the harness
      // sees a secret, not just the model call.
      const r = spawnSync(process.execPath, [INSTALL, ...arm.installArgs], { cwd: ws, env: safeCodexEnv(evalHome, { HOME: evalHome }).env, encoding: 'utf8' });
      meta.install_ok = r.status === 0;
    }
    const prompt = fs.readFileSync(path.join(DIR, task.prompt_file), 'utf8').trim();
    const finalPath = path.join(ws, 'final.txt');
    const trace = path.join(ws, 'hooktrace.jsonl');
    const { env } = safeCodexEnv(evalHome, { FABLE_HOOK_TRACE_FILE: trace });
    const inject = injectArgs(arm, ws);
    meta.inject = inject;
    let r;
    const started = process.hrtime.bigint();
    try { r = spawnCodex(codexArgs(prompt, finalPath, inject), { cwd: ws, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 }); }
    finally { meta.wall_clock_ms = Number(process.hrtime.bigint() - started) / 1e6; }
    meta.codex_exit = r.status;
    const events = String(r.stdout || '');
    const parsed = parseEvents(events);
    meta.counts = parsed.counts; meta.usage = parsed.usage; meta.failed = parsed.failed;

    // Hook-trust check: an H/S arm is only valid if Codex actually RAN the hooks (trusted). The hooks append
    // a zero-content line to the trace file when they fire; an empty/absent trace = hooks installed but inert
    // (untrusted), which would make the arm silently equal to M. Record it, and — with --require-hook-trust —
    // drop such a run rather than score a mislabeled arm.
    if (arm.requiresTrustedHooks) {
      if (arm.injectStyle) {
        // Native lifecycle hooks never fire under `codex exec` (no SessionStart event; SubagentStart needs a
        // spawned subagent). This arm therefore delivers the hook's working-style injection DETERMINISTICALLY
        // via `-c developer_instructions` (recorded in meta.inject), so it is always present — never dropped.
        meta.hook_fired = true;
        meta.hook_trust = 'n/a — working-style delivered via -c developer_instructions (native codex hooks do not fire under codex exec)';
      } else {
        const fired = (() => { try { return fs.readFileSync(trace, 'utf8').trim().length > 0; } catch { return false; } })();
        meta.hook_fired = fired;
        meta.hook_trust = fired ? 'verified (hooks fired)' : 'UNVERIFIED — hooks did not fire; trust them in Codex with /hooks';
        if (!fired && requireTrust) {
          process.stderr.write(`  drop  -> ${task.id}/${armId}: hooks did not fire and --require-hook-trust is set (untrusted H/S arm would collapse to M)\n`);
          return null;
        }
      }
    }

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
let exemptionPreflight = null;
if (requireHookExemption && tasks.length && order.some(armId => ARMS[armId].requiresTrustedHooks)) {
  if (legacyAssumeTrust) process.stderr.write('note: --assume-hook-trust is now a checked alias for --require-hook-exemption; it no longer bypasses verification.\n');
  const checked = checkHookExemption(evalHome);
  if (!checked.ok) {
    process.stderr.write(`hook-exemption precondition failed before arm start: ${checked.reason}\n`);
    process.exit(3);
  }
  exemptionPreflight = `verified (effective installed hook; captured event sha256 ${checked.event_sha256})`;
}
const results = [];
for (const task of tasks) for (const armId of order) results.push(runOne(task, armId, evalHome, outDir, exemptionPreflight));
const written = results.filter(Boolean);
process.stdout.write(`Wrote ${written.length} run(s) to ${outDir}${written.length < results.length ? ` (${results.length - written.length} dropped: untrusted hooks)` : ''}\n`);
if (JSON_OUT) process.stdout.write(JSON.stringify(written, null, 2) + '\n');
