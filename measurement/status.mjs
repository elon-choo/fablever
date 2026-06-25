#!/usr/bin/env node
// fablever measurement — holdout campaign status (read-only). Answers "is the holdout running, and how much
// data has it collected?" without needing the user to grep settings.json or the ledger by hand.
//
// Usage: node measurement/status.mjs        (also: node install.mjs --measure-status)
// No keys, no network. Reads only ~/.claude/settings.json and ~/.claude/fable-profile/measure-*.
'use strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cdir = path.join(os.homedir(), '.claude');
const fdir = path.join(cdir, 'fable-profile');
const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

const settings = readJSON(path.join(cdir, 'settings.json')) || {};
const sessionStart = (settings.hooks && settings.hooks.SessionStart) || [];
const registered = sessionStart.some(e => (e.hooks || []).some(h => typeof h.command === 'string' && /fable-holdout\.js/.test(h.command)));
const measureEnv = (process.env.FABLE_MEASURE || '').toLowerCase();
const active = registered && (measureEnv === 'on' || measureEnv === '1' || measureEnv === 'true');

let onCount = 0, offCount = 0, total = 0;
try {
  for (const line of fs.readFileSync(path.join(fdir, 'measure-ledger.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.arm === 'on') onCount++; else if (o.arm === 'off') offCount++; total++; } catch {}
  }
} catch {}

console.log('# fablever measurement holdout — status\n');
console.log(`  hook registered (SessionStart): ${registered ? 'YES' : 'no  (install with: node install.mjs --with-measure-holdout)'}`);
console.log(`  FABLE_MEASURE env:              ${measureEnv || '(unset)'}`);
console.log(`  campaign active right now:      ${active ? 'YES — assigning + logging arms' : 'no  (inert; needs both the hook AND FABLE_MEASURE=on)'}`);
console.log(`  ledger assignments:             ${total} total  (on=${onCount}, off=${offCount})`);
console.log('');
if (!registered) console.log('  To start: node install.mjs --with-measure-holdout   then  export FABLE_MEASURE=on   (read measurement/README.md first — the off arm runs ~1/5 of your sessions untreated).');
else if (!active) console.log('  Hook is installed but inert. Start a campaign: export FABLE_MEASURE=on  (in ~/.zshrc for a sustained run).');
else console.log('  Running. Read it out:  npm run measure:collect  &&  npm run measure:analyze   (analysis parks until ≥15 sessions/arm).');
