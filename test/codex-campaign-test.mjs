// codex-campaign-test.mjs — the Codex holdout campaign lifecycle (start / log / status / stop), in a throwaway
// HOME + CODEX_HOME. Asserts: start needs a full install, seeds the salt + campaign.json, registers the
// fablever:-prefixed measure logger on every lifecycle event WITHOUT disturbing the injector hooks; the
// runtime logger writes metadata-only rows under the campaign home; status aggregates per arm; stop removes
// ONLY the measure entries; and the normal Codex uninstall also clears them (shared prefix). Exit 0 = pass.
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
const CAMPAIGN = path.join(REPO, 'measurement', 'codex-campaign.mjs');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

const SB = mkdtempSync(path.join(tmpdir(), 'codex-camp-'));
const CH = path.join(SB, '.codex'); mkdirSync(CH, { recursive: true });
const env = { ...process.env, HOME: SB, USERPROFILE: SB, CODEX_HOME: CH };
const run = (bin, a) => spawnSync(process.execPath, [bin, ...a], { env, cwd: REPO, encoding: 'utf8' });

const measureHome = path.join(CH, 'fable-profile', 'measure');
const hooksJson = path.join(CH, 'hooks.json');
const measureEntries = obj => { let c = 0; for (const ev of Object.keys(obj?.hooks || {})) for (const e of obj.hooks[ev]) if ((e.hooks || []).some(h => String(h.statusMessage || '').startsWith('fablever: measure'))) c++; return c; };
const injectorEntries = obj => { let c = 0; for (const ev of Object.keys(obj?.hooks || {})) for (const e of obj.hooks[ev]) if ((e.hooks || []).some(h => /fable-(session|subagent)/.test(String(h.command || '')))) c++; return c; };

// start before a full install should refuse
{
  const r = run(CAMPAIGN, ['start', '--campaign=t0']);
  t(r.status !== 0 && /full Codex install/.test(r.stderr || ''), 'start without runtime: refuses and points to --codex-full');
}

// full install, then start
run(INSTALL, ['--codex-full']);
const injectorsBefore = injectorEntries(rj(hooksJson));
const startR = run(CAMPAIGN, ['start', '--campaign=t1', '--allocation=60:40']);
{
  t(statSync(path.join(measureHome, 'measurement-salt')).mode & 0o777 && existsSync(path.join(measureHome, 'measurement-salt')), 'start: salt seeded under the campaign home');
  const cfg = rj(path.join(measureHome, 'campaign.json'));
  t(cfg && cfg.campaign_id === 't1' && cfg.off_pct === 60, 'start: campaign.json records id + off_pct');
  t(/export FABLE_MEASURE=on/.test(startR.stdout) && /FABLE_MEASURE_OFF_PCT=60/.test(startR.stdout), 'start: prints the env exports (incl. off pct)');
  const hj = rj(hooksJson);
  t(measureEntries(hj) === 8, 'start: measure logger registered on all 8 lifecycle events');
  t(injectorEntries(hj) === injectorsBefore && injectorsBefore >= 1, 'start: injector hooks untouched');
}

// the runtime logger writes metadata-only rows; status aggregates them
{
  const logger = path.join(CH, 'fable-profile', 'runtime', 'measurement', 'hooks', 'codex-measure.js');
  t(existsSync(logger), 'runtime: measurement logger present in the Codex runtime copy');
  const logEnv = { ...env, FABLE_MEASURE: 'on', FABLE_MEASURE_HOME: measureHome, FABLE_MEASURE_CAMPAIGN: 't1', FABLE_MEASURE_OFF_PCT: '60' };
  for (let i = 0; i < 30; i++) spawnSync(process.execPath, [logger], { env: logEnv, input: JSON.stringify({ session_id: 'cs' + i, cwd: '/proj', hook_event_name: 'SessionStart', model: 'gpt-5.5-codex' }), encoding: 'utf8' });
  const ledger = readdirSync(path.join(measureHome, 'events')).map(f => read(path.join(measureHome, 'events', f))).join('');
  t(!ledger.includes('cs0') && !ledger.includes('/proj'), 'logger: raw session id / cwd never written to the ledger');
  const st = run(CAMPAIGN, ['status']);
  t(/campaign: t1/.test(st.stdout) && /arm\s+sessions\s+events/.test(st.stdout), 'status: reports the campaign + per-arm table');
  t(/UNDERPOWERED|park-until-proven/.test(st.stdout), 'status: refuses a verdict below 15 sessions/arm');
}

// stop removes only measure entries; injectors remain
{
  const stopR = run(CAMPAIGN, ['stop']);
  const hj = rj(hooksJson);
  t(measureEntries(hj) === 0, 'stop: all measure entries removed');
  t(injectorEntries(hj) === injectorsBefore, 'stop: injector hooks preserved');
  t(/unset FABLE_MEASURE/.test(stopR.stdout), 'stop: tells the user to unset the campaign env');
}

// the normal Codex uninstall also clears a measure registration (shared fablever: prefix)
{
  run(CAMPAIGN, ['start', '--campaign=t2']);
  t(measureEntries(rj(hooksJson)) === 8, 're-start: measure entries back');
  run(INSTALL, ['--uninstall', '--codex']);
  t(!existsSync(hooksJson) || measureEntries(rj(hooksJson)) === 0, 'uninstall --codex: also removes the measure entries (shared prefix)');
}

rmSync(SB, { recursive: true, force: true });
console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
