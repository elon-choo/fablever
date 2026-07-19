// cost-instrumentation-test.mjs — offline bidirectional oracle for codex-native-ab cost recording.
// PASS fixture: shipped hook exemption + fake Codex => per-arm tokens, wall time, fixture hash, archive replay.
// FAIL fixture: seeded hook that injects into an exempt worker => nonzero before even baseline arm B starts.
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = path.join(REPO, 'eval', 'codex-native-ab', 'run.mjs');
const REPORT = path.join(REPO, 'eval', 'codex-native-ab', 'cost-report.mjs');
const FIXTURE = path.join(REPO, 'eval', 'codex-native-ab', 'fixtures', 'nochange-001');
const FIXTURE_SHA256 = '2ed260c761553297493de7eeb64df4b18ee940d34ca1876ba899e8a5fd368308';
const compareText = (a, b) => a < b ? -1 : (a > b ? 1 : 0);

let ok = 0, n = 0;
const t = (condition, message) => { n++; if (condition) { ok++; console.log('PASS:', message); } else console.log('FAIL:', message); };
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const markerLines = home => { try { return readFileSync(path.join(home, 'arm-started.jsonl'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

// Independent implementation of the documented fixture digest: sorted normalized path + raw-content hash.
function expectedFixtureHash(root) {
  const files = [];
  const walk = (dir, base = root) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute, base);
      else if (entry.isFile()) files.push({ absolute, relative: path.relative(base, absolute).split(path.sep).join('/') });
    }
  };
  walk(root);
  const entries = files.sort((a, b) => compareText(a.relative, b.relative)).map(file => ({
    path: file.relative,
    sha256: createHash('sha256').update(readFileSync(file.absolute)).digest('hex'),
  }));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

const root = mkdtempSync(path.join(tmpdir(), 'cost-instrumentation-'));
try {
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  writeFileSync(fakeCodex, `
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const isHookArm = argv.some((arg, index) => arg === '-c' && /^developer_instructions=/.test(argv[index + 1] || ''));
fs.appendFileSync(path.join(process.env.CODEX_HOME, 'arm-started.jsonl'), (isHookArm ? 'H' : 'B') + '\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 35);
const outputIndex = argv.indexOf('-o');
if (outputIndex >= 0) fs.writeFileSync(argv[outputIndex + 1], 'No change needed. Verified by the fixture test.\\n');
const usage = isHookArm ? { input_tokens: 140, output_tokens: 60 } : { input_tokens: 70, output_tokens: 30, total_tokens: 100 };
process.stdout.write([
  JSON.stringify({ type: 'thread.started' }),
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'No change needed.' } }),
  JSON.stringify({ type: 'turn.completed', usage }),
].join('\\n') + '\\n');
`);

  // PASS direction: the shipped hook passes its exempt-role + ordinary-role control before B/H execute.
  const passHome = path.join(root, 'pass-home');
  const passOut = path.join(root, 'pass-out');
  const capturedEvent = path.join(root, 'captured-subagent-start.json');
  writeFileSync(capturedEvent, JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'red-team-validator', captured_contract: 'codex' }) + '\n');
  mkdirSync(passHome);
  const pass = spawnSync(process.execPath, [
    RUN, `--codex-home=${passHome}`, '--arms=B,H', '--task=nochange-001', '--seed=1',
    `--out=${passOut}`, '--require-hook-exemption', `--hook-exemption-event=${capturedEvent}`,
  ], { encoding: 'utf8', env: { ...process.env, FABLE_CODEX_BIN: fakeCodex } });
  const bMeta = readJson(path.join(passOut, 'nochange-001', 'B.meta.json'));
  const hMeta = readJson(path.join(passOut, 'nochange-001', 'H.meta.json'));
  const expectedHash = expectedFixtureHash(FIXTURE);

  t(pass.status === 0 && markerLines(passHome).length === 2, 'compliant fixture: checked precondition passes and both requested arms execute offline');
  t(Boolean(bMeta && hMeta && bMeta.usage && hMeta.usage && bMeta.usage.total === 100 && hMeta.usage.input + hMeta.usage.output === 200), 'runner records distinct per-arm token usage from the canned event streams');
  t(expectedHash === FIXTURE_SHA256 && bMeta?.fixture_sha256 === FIXTURE_SHA256 && hMeta?.fixture_sha256 === FIXTURE_SHA256, 'runner records the independently recomputed, archive-pinned fixture SHA-256 for every arm');
  t(bMeta?.wall_clock_ms >= 30 && hMeta?.wall_clock_ms >= 30, 'runner wall-clock measurement includes the fake Codex call delay for every arm');
  t(/verified \(/.test(hMeta?.hook_exemption_preflight || ''), 'requiring arm records that the exemption preflight was behaviorally verified');
  t(existsSync(path.join(passOut, 'nochange-001', 'B.raw.jsonl')) && existsSync(path.join(passOut, 'nochange-001', 'H.raw.jsonl')), 'recorded archive contains both raw event streams and metadata');

  const startsBeforeReplay = markerLines(passHome).length;
  const reportRun = spawnSync(process.execPath, [REPORT, `--out=${passOut}`], {
    encoding: 'utf8', env: { ...process.env, FABLE_CODEX_BIN: fakeCodex },
  });
  const report = (() => { try { return JSON.parse(reportRun.stdout); } catch { return null; } })();
  t(reportRun.status === 0 && report?.complete === true && report.total_runs === 2, 'archive replay emits a complete report from the two recorded meta files');
  t(report?.perArm?.B?.tokens === 100 && report?.perArm?.H?.tokens === 200, 'cost report emits correct total tokens per arm (including input+output fallback)');
  t(report?.perArm?.B?.wall_clock_ms === bMeta?.wall_clock_ms && report?.perArm?.H?.wall_clock_ms === hMeta?.wall_clock_ms, 'cost report replays exact per-arm wall-clock milliseconds');
  t(report?.perArm?.B?.fixture_sha256 === expectedHash && report?.perArm?.H?.fixture_sha256 === expectedHash, 'cost report emits the correct fixture SHA-256 per arm');
  t(report?.perArm?.B?.runs === 1 && report?.perArm?.H?.runs === 1, 'cost report emits the recorded run count per arm');
  t(markerLines(passHome).length === startsBeforeReplay, 'archive replay launches no model call');

  const orphanOut = path.join(root, 'orphan-out', 'nochange-001');
  mkdirSync(orphanOut, { recursive: true });
  writeFileSync(path.join(orphanOut, 'B.meta.json'), readFileSync(path.join(passOut, 'nochange-001', 'B.meta.json')));
  writeFileSync(path.join(orphanOut, 'B.raw.jsonl'), readFileSync(path.join(passOut, 'nochange-001', 'B.raw.jsonl')));
  writeFileSync(path.join(orphanOut, 'H.raw.jsonl'), '{"type":"turn.completed"}\n');
  const orphanReport = spawnSync(process.execPath, [REPORT, `--out=${path.dirname(orphanOut)}`], { encoding: 'utf8' });
  t(orphanReport.status !== 0 && /raw run\(s\) missing metadata: nochange-001\/H/.test(orphanReport.stderr), 'archive replay refuses an orphan raw stream instead of reporting an incomplete arm set as complete');

  // FAIL direction: the captured payload lacks the pinned live Codex agent_type field from SubagentStart.
  const invalidEvent = path.join(root, 'invalid-subagent-start.json');
  writeFileSync(invalidEvent, JSON.stringify({ hook_event_name: 'SubagentStart', agent_role: 'red-team-validator' }) + '\n');
  const failHome = path.join(root, 'fail-home');
  const failOut = path.join(root, 'fail-out');
  mkdirSync(failHome);
  const fail = spawnSync(process.execPath, [
    RUN, `--codex-home=${failHome}`, '--arms=B,H', '--task=nochange-001', '--seed=1',
    `--out=${failOut}`, '--assume-hook-trust', `--hook-exemption-event=${invalidEvent}`,
  ], { encoding: 'utf8', env: { ...process.env, FABLE_CODEX_BIN: fakeCodex } });

  t(fail.status !== 0 && /hook-exemption precondition failed before arm start/.test(fail.stderr) && /does not pin Codex agent_type/.test(fail.stderr), 'seeded violation: unconfirmed live payload shape exits nonzero before arm start');
  t(/checked alias/.test(fail.stderr), 'legacy --assume-hook-trust is a checked alias, not a trust-me bypass');
  t(markerLines(failHome).length === 0, 'seeded violation: no Codex arm starts (baseline B would have been first)');
  t(!existsSync(failOut), 'seeded violation: no arm artifacts are written before preflight failure');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
