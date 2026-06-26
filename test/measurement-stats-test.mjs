// measurement-stats-test.mjs — the read-out statistics (seeded bootstrap CI, permutation p, Cliff's delta,
// Holm) and the campaign `analyze` command. Asserts the stats behave on known fixtures, are reproducible
// (seeded), and that analyze honors park-until-proven (<15 qualified sessions/arm → no verdict) but produces
// a primary table with a verdict once each arm is powered. Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mean, median, bootstrapDiffCI, permutationP, cliffsDelta, holm } from '../measurement/lib/stats.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'measurement', 'codex-campaign.mjs');
let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

// ---- pure stats on known fixtures ----------------------------------------------------------------------
t(mean([1, 2, 3, 4]) === 2.5 && median([1, 2, 3, 4]) === 2.5 && median([1, 2, 3]) === 2, 'mean/median correct');

const hi = Array(30).fill(5), lo = Array(30).fill(0);
const sep = bootstrapDiffCI(hi, lo, { seed: 1 });
t(sep.point === 5 && sep.lo > 0 && sep.hi > 0, 'bootstrap CI: separated samples → CI excludes 0');
const same = bootstrapDiffCI(hi, [...hi], { seed: 1 });
t(same.point === 0 && same.lo <= 0 && same.hi >= 0, 'bootstrap CI: identical samples → point 0, CI includes 0');
const r1 = bootstrapDiffCI(hi, lo, { seed: 7 }), r2 = bootstrapDiffCI(hi, lo, { seed: 7 });
t(r1.lo === r2.lo && r1.hi === r2.hi, 'bootstrap CI: seeded → reproducible across calls');

// permutation: mixed (noisy but overlapping) vs clearly separated
const a = [1, 2, 1, 2, 1, 2, 1, 2], b = [1, 2, 1, 2, 1, 2, 1, 2];
t(permutationP(a, b, { seed: 3 }) > 0.3, 'permutation p: identical distributions → large p');
t(permutationP(Array(15).fill(10), Array(15).fill(0), { seed: 3 }) < 0.05, 'permutation p: separated → small p');
t(permutationP(hi, lo, { seed: 5 }) === permutationP(hi, lo, { seed: 5 }), 'permutation p: seeded → reproducible');

const cdFull = cliffsDelta([3, 4, 5], [0, 1, 2]);
t(cdFull.delta === 1 && cdFull.mag === 'large', "Cliff's δ: fully greater → 1 (large)");
t(cliffsDelta([1, 1, 1], [1, 1, 1]).delta === 0 && cliffsDelta([1, 1, 1], [1, 1, 1]).mag === 'negligible', "Cliff's δ: identical → 0 (negligible)");

const adj = holm([0.01, 0.04, 0.03]);
t(adj.every((p, i) => p >= [0.01, 0.04, 0.03][i] && p <= 1), 'Holm: adjusted ≥ raw and ≤ 1');
t(adj[0] === Math.min(1, 0.01 * 3), 'Holm: smallest p scaled by m');

// ---- analyze command on a synthesized ledger -----------------------------------------------------------
function seedCampaign(home, { onN, offN, textSignals = false, onFailed = 0, offFailed = 2 }) {
  const measure = path.join(home, 'fable-profile', 'measure');
  const events = path.join(measure, 'events');
  mkdirSync(events, { recursive: true });
  writeFileSync(path.join(measure, 'campaign.json'), JSON.stringify({ campaign_id: 'st', off_pct: 50, text_signals: textSignals, scope: 'user', host: 'codex' }) + '\n');
  const writeSession = (key, arm, failed) => {
    const rows = [];
    // 3 PostToolUse events → qualified (tool_calls >= 2); `failed` of them are failures
    for (let i = 0; i < 3; i++) rows.push({ v: 2, campaign_id: 'st', host: 'codex', session_key: key, project_key: 'p_x', arm, event: 'posttooluse', ts_ms: 1, metrics: { tool_call: 1, ...(i < failed ? { tool_failed: 1 } : {}) } });
    writeFileSync(path.join(events, `${key}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  };
  for (let i = 0; i < onN; i++) writeSession(`s_on${i}`, 'on', onFailed);
  for (let i = 0; i < offN; i++) writeSession(`s_off${i}`, 'off', offFailed);
  return measure;
}
const runAnalyze = home => spawnSync(process.execPath, [CLI, 'analyze'], { env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex') }, encoding: 'utf8' });

// NOTE: scope=user resolves measure home under CODEX_HOME/fable-profile/measure → seed there.
{
  const home = mkdtempSync(path.join(tmpdir(), 'mstat-under-'));
  seedCampaign(path.join(home, '.codex'), { onN: 5, offN: 5 });
  const r = runAnalyze(home);
  t(/UNDERPOWERED|park-until-proven/.test(r.stdout), 'analyze: <15/arm → UNDERPOWERED, no verdict');
  t(!/Holm/.test(r.stdout), 'analyze: underpowered run prints no primary stats');
  rmSync(home, { recursive: true, force: true });
}
{
  const home = mkdtempSync(path.join(tmpdir(), 'mstat-power-'));
  seedCampaign(path.join(home, '.codex'), { onN: 20, offN: 20 });
  const r = runAnalyze(home);
  t(/qualified sessions: on=20, off=20/.test(r.stdout), 'analyze: counts qualified sessions per arm');
  t(/failed_tool_rate/.test(r.stdout) && /Holm/.test(r.stdout) && /Cliff's δ/.test(r.stdout), 'analyze: prints primary RATE table with CI + Holm + Cliff δ');
  t(/(helps|HARMS|BREAK-EVEN)/.test(r.stdout), 'analyze: prints a sign-aware verdict when powered');
  t(/helps/.test(r.stdout), 'analyze: off-arm fails more → layer correctly read as HELPS (negative Δ), not harm');
  rmSync(home, { recursive: true, force: true });
}
// the always-on arm fails MORE → must be read as HARMS, never framed as a benefit (sign-aware verdict)
{
  const home = mkdtempSync(path.join(tmpdir(), 'mstat-harm-'));
  seedCampaign(path.join(home, '.codex'), { onN: 20, offN: 20, onFailed: 2, offFailed: 0 });
  const r = runAnalyze(home);
  t(/HARMS/.test(r.stdout) && !/✓ helps/.test(r.stdout), 'analyze: on-arm fails more → HARMS, NOT framed as a win (the sign-blind bug is fixed)');
  rmSync(home, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
