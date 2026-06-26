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
    : `\nReady for a descriptive read-out (≥${MIN}/arm). Analysis with CIs is the next milestone (analyzer upgrade).`);
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
  fs.writeFileSync(P.hooksJson, JSON.stringify(hooks, null, 2) + '\n');
  console.log(`Stopped: removed ${removed} measure hook entr${removed === 1 ? 'y' : 'ies'} (collected data kept under ${measureHome}).`);
  console.log(`Now unset the campaign env:  unset FABLE_MEASURE FABLE_MEASURE_HOME FABLE_MEASURE_CAMPAIGN FABLE_MEASURE_OFF_PCT FABLE_MEASURE_TEXT_SIGNALS`);
}

if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else status();
