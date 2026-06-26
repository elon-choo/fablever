#!/usr/bin/env node
// measurement/codex-campaign.mjs — start / status / stop a Codex long-session holdout campaign.
//
// This wires the already-correct measurement core (assign/privacy/holdout/codex-measure) into a runnable
// campaign WITHOUT touching the tested Codex installer flow. It reuses the Codex path + hook-entry helpers,
// so the measure hook it registers carries the same `fablever:` statusMessage prefix the normal Codex
// uninstall already removes. It never reads or writes any auth token. Zero dependencies.
//
//   node measurement/codex-campaign.mjs start  [--campaign=<id>] [--allocation=off:on] [--text-signals] [--scope=user|project]
//   node measurement/codex-campaign.mjs status [--scope=user|project]
//   node measurement/codex-campaign.mjs stop   [--scope=user|project]
//
// Prereq for `start`: a full Codex install (`node install.mjs --codex-full`) so the runtime (incl. the
// measurement event logger) exists. `start` prints the exact env exports you must run; the campaign only
// becomes active once FABLE_MEASURE=on is exported in the shell that launches Codex.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolvePaths } from '../codex/lib/paths.mjs';
import { HOOK_STATUS_PREFIX, addHookEntry } from '../codex/lib/markers.mjs';
import { mean, median, bootstrapDiffCI, permutationP, cliffsDelta, holm } from './lib/stats.mjs';

const require = createRequire(import.meta.url);
const { readOrCreateSalt } = require('./runtime/privacy.cjs');

const isWin = process.platform === 'win32';
const MEASURE_PREFIX = `${HOOK_STATUS_PREFIX} measure`; // every measure entry's statusMessage starts with this
// Events the logger records. SessionStart/SubagentStart also drive the injector holdout; the rest are signal.
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact', 'Stop'];

const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith('-')) || 'status';
const flag = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const scope = flag('scope', 'user') === 'project' ? 'project' : 'user';
const P = resolvePaths(scope, { env: process.env, cwd: process.cwd() });
const measureHome = path.join(P.profileHome, 'measure');
const campaignFile = path.join(measureHome, 'campaign.json');
const eventsDir = path.join(measureHome, 'events');
const measureHook = path.join(P.runtime, 'measurement', 'hooks', 'codex-measure.js');
const toWin = p => p.replace(/\//g, '\\');

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const isMeasureEntry = e => Array.isArray(e?.hooks) && e.hooks.some(h => String(h.statusMessage || '').startsWith(MEASURE_PREFIX));
const fmt = (x, dp = 2) => (x == null || Number.isNaN(x)) ? 'n/a' : Number(x).toFixed(dp);

function start() {
  if (!fs.existsSync(measureHook)) {
    console.error(`[campaign] runtime logger not found at ${measureHook}.\nRun a full Codex install first:  node install.mjs --codex-full${scope === 'project' ? ' --codex-scope=project' : ''}`);
    process.exit(1);
  }
  const campaign = flag('campaign', 'codex-campaign');
  const alloc = String(flag('allocation', '50:50')).split(':');
  let offPct = Number(alloc[0]); if (!Number.isFinite(offPct)) offPct = 50; offPct = Math.max(0, Math.min(100, offPct));
  const textSignals = args.includes('--text-signals');

  fs.mkdirSync(measureHome, { recursive: true });
  readOrCreateSalt(measureHome); // pre-seed the salt so the very first session's injector guard agrees
  fs.writeFileSync(campaignFile, JSON.stringify({ campaign_id: campaign, off_pct: offPct, text_signals: textSignals, scope, host: 'codex' }, null, 2) + '\n');

  // register the measure logger on every lifecycle event (fablever:-prefixed → normal uninstall removes it)
  let hooks = readJson(P.hooksJson) || {};
  for (const ev of EVENTS) {
    addHookEntry(hooks, ev, { hooks: [{ type: 'command', command: `node "${measureHook}"`, commandWindows: `node "${toWin(measureHook)}"`, timeout: 10, statusMessage: `${MEASURE_PREFIX} ${ev}` }] });
  }
  fs.mkdirSync(path.dirname(P.hooksJson), { recursive: true });
  fs.writeFileSync(P.hooksJson, JSON.stringify(hooks, null, 2) + '\n');

  const expLines = [
    `export FABLE_MEASURE=on`,
    `export FABLE_MEASURE_HOME="${measureHome}"`,
    `export FABLE_MEASURE_CAMPAIGN="${campaign}"`,
    `export FABLE_MEASURE_OFF_PCT=${offPct}`,
  ];
  if (textSignals) expLines.push(`export FABLE_MEASURE_TEXT_SIGNALS=on`);
  console.log(`Codex measurement campaign "${campaign}" registered (scope: ${scope}, off arm: ${offPct}%${textSignals ? ', text-signals ON' : ''}).`);
  console.log(`\n1) Trust the logger hook in Codex:  /hooks`);
  console.log(`2) Export these in the shell you launch Codex from (add to ~/.zshrc for a sustained campaign):\n`);
  console.log(expLines.map(l => '   ' + l).join('\n'));
  console.log(`\nThe 'off' arm (${offPct}% of sessions) runs WITHOUT fablever injection — that degradation is the measurement.`);
  console.log(`Read out:  node measurement/codex-campaign.mjs status`);
  console.log(`Stop:      node measurement/codex-campaign.mjs stop   (keeps the collected data; then unset the FABLE_MEASURE* vars)`);
}

function status() {
  const cfg = readJson(campaignFile);
  console.log(`# Codex measurement campaign status (scope: ${scope})`);
  console.log(`measure home: ${measureHome}`);
  if (!cfg) { console.log(`No campaign registered here. Start one with:  node measurement/codex-campaign.mjs start`); return; }
  console.log(`campaign: ${cfg.campaign_id}   off arm: ${cfg.off_pct}%   text-signals: ${cfg.text_signals ? 'on' : 'off'}`);
  const perArm = { on: { sessions: new Set(), events: 0 }, off: { sessions: new Set(), events: 0 } };
  let files = []; try { files = fs.readdirSync(eventsDir); } catch {}
  for (const f of files) {
    let raw = ''; try { raw = fs.readFileSync(path.join(eventsDir, f), 'utf8'); } catch {}
    for (const line of raw.split('\n')) { if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch { continue; } const a = perArm[r.arm]; if (!a) continue; a.sessions.add(r.session_key); a.events++; }
  }
  const MIN = 15;
  console.log(`\narm   sessions   events`);
  for (const arm of ['on', 'off']) console.log(`${arm.padEnd(5)} ${String(perArm[arm].sessions.size).padStart(8)} ${String(perArm[arm].events).padStart(8)}`);
  const minSessions = Math.min(perArm.on.sessions.size, perArm.off.sessions.size);
  console.log(minSessions < MIN
    ? `\nUNDERPOWERED — need ≥${MIN} sessions per arm before any read-out (have ${minSessions} in the smaller arm). park-until-proven.`
    : `\nReady for a read-out (≥${MIN}/arm). Run:  node measurement/codex-campaign.mjs analyze   (bootstrap CI + permutation p + Cliff's δ, Holm-corrected).`);
}

// Aggregate the event ledger into per-session metric sums tagged by arm.
function loadSessions() {
  const sessions = new Map();
  let files = []; try { files = fs.readdirSync(eventsDir); } catch { return sessions; }
  for (const f of files) {
    let raw = ''; try { raw = fs.readFileSync(path.join(eventsDir, f), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch { continue; }
      if (!r.session_key || (r.arm !== 'on' && r.arm !== 'off')) continue;
      let s = sessions.get(r.session_key);
      if (!s) { s = { arm: r.arm, m: {} }; sessions.set(r.session_key, s); }
      for (const [k, v] of Object.entries(r.metrics || {})) s.m[k] = (s.m[k] || 0) + Number(v || 0);
    }
  }
  return sessions;
}

const MIN_PER_ARM = 15;

function analyze() {
  const cfg = readJson(campaignFile);
  console.log(`# Codex holdout analysis (scope: ${scope})`);
  if (!cfg) { console.log('No campaign here. Start one first.'); return; }
  console.log(`campaign: ${cfg.campaign_id}   off arm: ${cfg.off_pct}%   text-signals: ${cfg.text_signals ? 'on' : 'off'}\n`);

  // qualified session = at least 2 user turns OR 2 tool calls (a real working session, not a no-op).
  const arms = { on: [], off: [] };
  for (const s of loadSessions().values()) {
    const m = s.m; const o = {
      user_turns: m.user_turn || 0, tool_calls: m.tool_call || 0, edits: m.edit || 0,
      shell_calls: m.shell_call || 0, tool_failed: m.tool_failed || 0, reinstructions: m.reinstruction || 0,
      subagents: m.subagent_start || 0, compactions: m.precompact || 0,
    };
    if (o.user_turns >= 2 || o.tool_calls >= 2) arms[s.arm].push(o);
  }
  const col = (arm, key) => arms[arm].map(o => o[key]);
  console.log(`qualified sessions: on=${arms.on.length}, off=${arms.off.length} (floor per arm = ${MIN_PER_ARM})\n`);

  // descriptive (always)
  const DESC = ['user_turns', 'tool_calls', 'edits', 'shell_calls', 'subagents', 'compactions'];
  console.log('## descriptive (mean | median)');
  for (const k of DESC) console.log(`  ${k.padEnd(14)} on=${fmt(mean(col('on', k)))}|${fmt(median(col('on', k)))}   off=${fmt(mean(col('off', k)))}|${fmt(median(col('off', k)))}`);

  if (arms.on.length < MIN_PER_ARM || arms.off.length < MIN_PER_ARM) {
    console.log(`\n## verdict — UNDERPOWERED (park-until-proven): need ≥${MIN_PER_ARM} qualified sessions per arm. No verdict, no CI claim from a thin sample.`);
    return;
  }

  // primary lower-is-better outcomes — as RATES, not raw counts, so a pure session-length imbalance (one arm
  // simply running longer) can't masquerade as an effect. failed-tool RATE = tool_failed / tool_calls;
  // re-instruction RATE = reinstructions / user_turns (text-signals only).
  const rateCol = (arm, num, den) => arms[arm].map(o => o[num] / Math.max(1, o[den]));
  const PRIMARY = [{ label: 'failed_tool_rate', num: 'tool_failed', den: 'tool_calls' },
    ...(cfg.text_signals ? [{ label: 'reinstruction_rate', num: 'reinstructions', den: 'user_turns' }] : [])];
  const rows = PRIMARY.map(P => {
    const on = rateCol('on', P.num, P.den), off = rateCol('off', P.num, P.den);
    return { label: P.label, ci: bootstrapDiffCI(on, off, { seed: 12345 }), p: permutationP(on, off, { seed: 999 }), cd: cliffsDelta(on, off) };
  });
  const adj = holm(rows.map(r => r.p));
  console.log('\n## primary lower-is-better RATES (on − off; negative = the always-on layer REDUCES the bad rate)');
  rows.forEach((r, i) => {
    console.log(`  ${r.label.padEnd(18)} Δ=${fmt(r.ci.point, 3)}  95% CI [${fmt(r.ci.lo, 3)}, ${fmt(r.ci.hi, 3)}]  p=${fmt(r.p, 3)} (Holm ${fmt(adj[i], 3)})  Cliff's δ=${fmt(r.cd.delta, 3)} (${r.cd.mag})`);
  });
  // Sign-aware: a significant outcome HELPS only if the layer reduced the bad rate (point < 0); a
  // significant outcome with point > 0 means the always-on layer made it WORSE — never frame that as a win.
  const sig = rows.filter((r, i) => adj[i] < 0.05);
  const helps = sig.filter(r => r.ci.point < 0).map(r => r.label);
  const harms = sig.filter(r => r.ci.point > 0).map(r => r.label);
  console.log('\n## verdict (note: percentile bootstrap CI is mildly anti-conservative near the 15/arm floor — lean on Holm + a clearly-signed CI)');
  if (harms.length) console.log(`  ⚠ HARMS: the always-on layer significantly INCREASED ${harms.join(', ')} — a net loss on those outcomes; do not keep it always-on for this workload.`);
  if (helps.length) console.log(`  ✓ helps: the always-on layer significantly reduced ${helps.join(', ')} — it is paying for its context there.`);
  if (!sig.length) console.log('  BREAK-EVEN: no primary rate is distinguishable after Holm correction (CIs include 0). lift≈0 is a warning for an always-on layer, not a pass — it spends context it is not visibly repaying.');
}

function stop() {
  const hooks = readJson(P.hooksJson);
  if (!hooks || !hooks.hooks) { console.log('No hooks.json / nothing to stop.'); return; }
  let removed = 0;
  for (const ev of Object.keys(hooks.hooks)) {
    if (!Array.isArray(hooks.hooks[ev])) continue;
    const before = hooks.hooks[ev].length;
    hooks.hooks[ev] = hooks.hooks[ev].filter(e => !isMeasureEntry(e));
    removed += before - hooks.hooks[ev].length;
    if (hooks.hooks[ev].length === 0) delete hooks.hooks[ev];
  }
  if (Object.keys(hooks.hooks).length === 0) delete hooks.hooks;
  // Mirror the uninstall convention: if nothing is left, remove the file rather than leave an empty {}.
  if (Object.keys(hooks).length === 0) { try { fs.unlinkSync(P.hooksJson); } catch (_) {} }
  else fs.writeFileSync(P.hooksJson, JSON.stringify(hooks, null, 2) + '\n');
  console.log(`Stopped: removed ${removed} measure hook entr${removed === 1 ? 'y' : 'ies'} (collected data kept under ${measureHome}).`);
  console.log(`Now unset the campaign env:  unset FABLE_MEASURE FABLE_MEASURE_HOME FABLE_MEASURE_CAMPAIGN FABLE_MEASURE_OFF_PCT FABLE_MEASURE_TEXT_SIGNALS`);
}

if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'analyze') analyze();
else status();
