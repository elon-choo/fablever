// codex-ab-runner-test.mjs — the codex-native-ab harness, driven OFFLINE by a fake codex shim (no auth, no
// network, no real model). Asserts: --dry-run writes nothing and makes no model call; the safe env forwards
// NO secret; the JSONL event parser counts defensively; and an execute run records the production-file diff,
// the verification result, scope-violation / unnecessary-change detection, and the raw event stream.
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { safeCodexEnv, SECRET_RE } from '../eval/codex-native-ab/lib/safe-env.mjs';
import { parseEvents } from '../eval/codex-native-ab/lib/codex-events.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = path.join(REPO, 'eval', 'codex-native-ab', 'run.mjs');
const FAKE = path.join(REPO, 'test', 'fixtures', 'fake-codex.js');
const FAKE_EAGER = path.join(REPO, 'test', 'fixtures', 'fake-codex-eager.js');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// ---------------------------------------------------------------------------------------------------------
// 1) dry-run --json: a full plan, nothing written, no model call
{
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'cab-dry-')), 'out');
  const r = spawnSync(process.execPath, [RUN, '--dry-run', '--json', `--out=${out}`], { encoding: 'utf8' });
  const p = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  t(p && p.total_runs === 10 && p.arms.length === 5 && p.tasks.length === 2, 'dry-run --json: plan covers 2 tasks × 5 arms');
  t(p && /exec --json --ephemeral/.test(p.codex_command_template), 'dry-run: codex command template is grounded in real flags');
  t(p && /FROZEN oracle/.test(p.scoring), 'dry-run: scoring keeps the unsupported-claim metric on the frozen oracle');
  t(!existsSync(out), 'dry-run: writes nothing (no out dir created)');
}

// 2) dry-run text mentions no side effects
{
  const r = spawnSync(process.execPath, [RUN, '--dry-run'], { encoding: 'utf8' });
  t(/No install, no model call, nothing written/.test(r.stdout), 'dry-run text: states no install / no model call / no writes');
}

// ---------------------------------------------------------------------------------------------------------
// 3) safe env forwards NO secret
{
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = 'sk-PLANT-123';
  process.env.CODEX_ACCESS_TOKEN = 'tok-PLANT-456';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-PLANT';
  const { env, leaked } = safeCodexEnv('/eval/home', { FABLE_HOOK_TRACE_FILE: '/tmp/x' });
  const keys = Object.keys(env);
  t(!keys.some(k => SECRET_RE.test(k)), 'safe env: no secret-looking key forwarded');
  t(!JSON.stringify(env).includes('PLANT'), 'safe env: no planted secret value present');
  t(env.CODEX_HOME === '/eval/home' && env.FABLE_EVAL === 'on' && env.FABLE_HOOK_TRACE_FILE === '/tmp/x', 'safe env: keeps CODEX_HOME + eval markers + explicit extras');
  t(Array.isArray(leaked) && leaked.length === 0, 'safe env: nothing flagged as leaked (allowlist held)');
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
}

// 4) defensive event parser
{
  const jsonl = [
    JSON.stringify({ type: 'thread.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'ls', exit_code: 0 } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'bad', exit_code: 2 } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'file_change', path: 'a.js' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'mcp_tool_call', server: 'fable-profile' } }),
    'this is not json',
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }),
  ].join('\n');
  const p = parseEvents(jsonl);
  t(p.counts.commands === 2 && p.counts.command_failures === 1, 'parser: counts commands + failures (exit_code≠0)');
  t(p.counts.file_changes === 1 && p.counts.mcp_calls === 1, 'parser: counts file changes + MCP calls');
  t(p.usage && p.usage.output === 50 && p.lastMessageText === 'done', 'parser: extracts usage + last message');
  t(p.unparsed === 1, 'parser: fail-open — preserves the run, just counts the unparseable line');
  t(parseEvents(JSON.stringify({ type: 'turn.failed' })).failed === true, 'parser: turn.failed → failed');
}

// ---------------------------------------------------------------------------------------------------------
// helper to execute one fake run (arm B = plain, needs no real install/auth). `bin` picks which "model"
// shim drives it — the disciplined one or the over-eager one. FABLE_CODEX_BIN is read by run.mjs (the
// parent), so it is not subject to the child env stripping.
function execOne(task, bin = FAKE) {
  const home = mkdtempSync(path.join(tmpdir(), 'cab-home-'));
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'cab-out-')), 'out');
  const r = spawnSync(process.execPath, [RUN, `--codex-home=${home}`, '--arms=B', `--task=${task}`, `--out=${out}`], { encoding: 'utf8', env: { ...process.env, FABLE_CODEX_BIN: bin } });
  const meta = rj(path.join(out, task, 'B.meta.json'));
  const raw = (() => { try { return readFileSync(path.join(out, task, 'B.raw.jsonl'), 'utf8'); } catch { return ''; } })();
  const final = (() => { try { return readFileSync(path.join(out, task, 'B.final.txt'), 'utf8'); } catch { return ''; } })();
  rmSync(home, { recursive: true, force: true }); rmSync(path.dirname(out), { recursive: true, force: true });
  return { r, meta, raw, final };
}

// 5) clean in-scope fix
{
  const { meta, raw, final } = execOne('scope-001-stripped');
  t(meta && meta.scope_violation === false, 'execute: in-scope fix → no scope violation');
  t(meta && meta.acceptance_pass === true, 'execute: acceptance check passes (node --check)');
  t(meta && JSON.stringify(meta.changed_files) === JSON.stringify(['src/parser.js']), 'execute: only the allowed file changed');
  t(meta && meta.counts.commands >= 1 && meta.usage && meta.usage.output === 340, 'execute: events parsed (commands + usage)');
  t(raw.includes('turn.completed') && /Fixed/.test(final), 'execute: raw event stream + final message captured');
}

// 6) scope violation detected (the over-eager model touches a forbidden file)
{
  const { meta } = execOne('scope-001-stripped', FAKE_EAGER);
  t(meta && meta.scope_violation === true && meta.changed_files.includes('src/config.js'), 'execute: over-eager model touches a forbidden file → scope violation');
}

// 7) no-change task: the disciplined model leaves it alone
{
  const { meta } = execOne('nochange-001', FAKE);
  t(meta && meta.unnecessary_change === false && meta.changed_files.length === 0, 'execute: no-change task left untouched → no unnecessary change');
}

// 8) no-change task: the over-eager model rewrites it (action bias)
{
  const { meta } = execOne('nochange-001', FAKE_EAGER);
  t(meta && meta.unnecessary_change === true, 'execute: editing an already-correct file → unnecessary change flagged');
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
