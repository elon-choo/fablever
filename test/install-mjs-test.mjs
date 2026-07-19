// install-mjs-test.mjs — verify the UNIVERSAL Node installer (install.mjs) matches install.sh's
// core behavior on this platform: install, idempotent re-run, preset preservation, clean uninstall.
// Runs in a throwaway HOME so it never touches the real ~/.claude. No network (uses --no-mcp).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
const SB = mkdtempSync(path.join(tmpdir(), 'fable-mjs-'));
const settings = path.join(SB, '.claude', 'settings.json');
mkdirSync(path.join(SB, '.claude'), { recursive: true });
writeFileSync(settings, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] }, effortLevel: 'xhigh', permissions: { allow: ['Bash'] } }));

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
// Sandbox BOTH HOME (POSIX) and USERPROFILE — on Windows os.homedir() reads USERPROFILE, not HOME,
// so overriding only HOME would let install.mjs escape to the real ~/.claude (verified on Win 11).
const runAtEnv = (home, extraEnv, ...args) => {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
  };
  delete env.FABLE_READONLY_VERIFIER;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, [INSTALL, ...args], { env, encoding: 'utf8' });
};
const runAt = (home, ...args) => runAtEnv(home, {}, ...args);
const run = (...args) => runAt(SB, ...args);
const J = () => JSON.parse(readFileSync(settings, 'utf8'));
const F = p => path.join(SB, '.claude', p);
const rd = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };       // missing -> clean FAIL, not a crash
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };

run('--no-mcp');
t(J().outputStyle === 'Fable', 'install.mjs: outputStyle=Fable');
const ss = JSON.stringify(J().hooks.SessionStart || []);
t(/fable-onboard/.test(ss) && /fable-model-check/.test(ss), 'install.mjs: SessionStart onboard+modelcheck registered');
t(/fable-update-check/.test(ss), 'install.mjs: SessionStart update-check registered');
t(/fablever/.test(rj(F('fable-profile/installed-version.json')).repo_url || ''), 'install.mjs: installed-version.json recorded (repo_url)');
t(/fable-subagent/.test(JSON.stringify(J().hooks.SubagentStart || [])), 'install.mjs: SubagentStart registered');
t(!/fable-readonly-verifier-gate/.test(JSON.stringify(J().hooks.PreToolUse || [])), 'install.mjs: no always-on read-only gate registered');
t(J().hooks.Stop && J().effortLevel === 'xhigh' && J().permissions.allow.length === 1, 'install.mjs: existing settings preserved');
t(!existsSync(F('agents/fable-readonly-verifier.md')), 'install.mjs: read-only verifier agent is default-off');
t(!existsSync(F('hooks/fable-readonly-verifier-gate.js')), 'install.mjs: read-only verifier gate is default-off');
t(existsSync(F('fable-profile/runtime/orchestration/lib/xverify-preset.mjs')), 'install.mjs: orchestration copied into runtime');
t(existsSync(F('fable-profile/fable-home')), 'install.mjs: fable-home pointer written');
t(rj(F('fable-profile/mode.json')).ultra === 'auto', 'install.mjs: mode.json seeded');
t(rd(F('fable-profile/full.md')).length > 500, 'install.mjs: profile resolves');
t(readdirSync(F('')).some(f => f.startsWith('settings.json.fable-bak-')), 'install.mjs: settings backed up');

run('--no-mcp'); // idempotent
t((JSON.stringify(J().hooks.SessionStart).match(/fable-onboard/g) || []).length === 1, 'install.mjs: idempotent (onboard once)');

run('--no-mcp', '--with-xverify=gpt-oauth');
t(rj(F('fable-profile/xverify.json')).preset === 'gpt-oauth', 'install.mjs: explicit preset set');
run('--no-mcp'); // plain re-run must preserve
t(rj(F('fable-profile/xverify.json')).preset === 'gpt-oauth', 'install.mjs: plain re-run preserves preset');

run('--uninstall');
const after = J();
t(!after.outputStyle && !(after.hooks && after.hooks.SessionStart) && !(after.hooks && after.hooks.SubagentStart) && !(after.hooks && after.hooks.PreToolUse) && after.hooks.Stop && after.effortLevel === 'xhigh', 'install.mjs: uninstall clean (kept Stop/effort)');
t(!existsSync(F('output-styles/Fable.md')), 'install.mjs: style file removed on uninstall');
t(!existsSync(F('agents/fable-readonly-verifier.md')), 'install.mjs: read-only verifier agent removed on uninstall');
t(!existsSync(F('hooks/fable-readonly-verifier-gate.js')), 'install.mjs: read-only verifier gate removed on uninstall');

const XV = mkdtempSync(path.join(tmpdir(), 'fable-mjs-xverify-'));
mkdirSync(path.join(XV, '.claude'), { recursive: true });
writeFileSync(path.join(XV, '.claude', 'settings.json'), '{}\n');
const reducedArgs = ['--with-xverify=gpt-oauth', '--no-mcp', '--no-subagent', '--no-onboard', '--no-modelcheck', '--no-update-check'];
const reduced = runAt(XV, ...reducedArgs);
t(reduced.status === 0, 'install.mjs: reduced explicit xverify install exits 0');
const XF = p => path.join(XV, '.claude', p);
t(!existsSync(XF('agents/fable-readonly-verifier.md')), 'install.mjs: xverify does not implicitly install read-only agent');
t(!existsSync(XF('hooks/fable-readonly-verifier-gate.js')), 'install.mjs: xverify does not implicitly install read-only gate');
t(existsSync(XF('fable-profile/runtime/orchestration/recipes/adversarial-verify.mjs')), 'install.mjs: reduced explicit xverify deploys orchestration runtime');
const dry = runAt(XV, ...reducedArgs, '--dry-run', '--json');
const dryPlan = (() => { try { return JSON.parse(dry.stdout); } catch { return {}; } })();
t(dryPlan.mode !== 'style-only' && !/agent-scoped PreToolUse/.test(JSON.stringify(dryPlan)), 'install.mjs: xverify dry-run is non-style-only without an implicit verifier gate');

const SA = mkdtempSync(path.join(tmpdir(), 'fable-mjs-subagent-'));
mkdirSync(path.join(SA, '.claude'), { recursive: true });
writeFileSync(path.join(SA, '.claude', 'settings.json'), '{}\n');
const subagentOnly = runAt(SA, '--no-mcp', '--no-onboard', '--no-modelcheck', '--no-update-check');
t(subagentOnly.status === 0, 'install.mjs: reduced subagent-only install exits 0');
t(!existsSync(path.join(SA, '.claude', 'agents', 'fable-readonly-verifier.md'))
  && !existsSync(path.join(SA, '.claude', 'hooks', 'fable-readonly-verifier-gate.js')),
  'install.mjs: subagent install does not implicitly deploy verifier agent + gate');

const RO = mkdtempSync(path.join(tmpdir(), 'fable-mjs-readonly-'));
mkdirSync(path.join(RO, '.claude'), { recursive: true });
writeFileSync(path.join(RO, '.claude', 'settings.json'), '{}\n');
const readonlyOptin = runAtEnv(
  RO,
  { FABLE_READONLY_VERIFIER: ' true ' },
  '--no-mcp',
  '--no-subagent',
  '--no-onboard',
  '--no-modelcheck',
  '--no-update-check',
);
const RF = p => path.join(RO, '.claude', p);
t(readonlyOptin.status === 0, 'install.mjs: padded read-only verifier opt-in is trimmed and exits 0');
t(/tools:\s*Read,\s*Grep,\s*Glob/.test(rd(RF('agents/fable-readonly-verifier.md'))), 'install.mjs: opt-in verifier agent carries explicit tools allowlist');
t(/hooks:\s*\n\s*PreToolUse:[\s\S]*fable-readonly-verifier-gate/.test(rd(RF('agents/fable-readonly-verifier.md'))), 'install.mjs: opt-in verifier agent carries its scoped PreToolUse gate');
t(existsSync(RF('hooks/fable-readonly-verifier-gate.js')), 'install.mjs: explicit opt-in installs read-only verifier gate');
const readonlyOff = runAtEnv(
  RO,
  { FABLE_READONLY_VERIFIER: 'off' },
  '--no-mcp',
  '--no-subagent',
  '--no-onboard',
  '--no-modelcheck',
  '--no-update-check',
);
t(readonlyOff.status === 0, 'install.mjs: explicit verifier off re-install exits 0');
t(!existsSync(RF('agents/fable-readonly-verifier.md'))
  && !existsSync(RF('hooks/fable-readonly-verifier-gate.js')),
  'install.mjs: explicit verifier off restores the default agent + gate surface');
runAt(RO, '--uninstall');

const UNOWNED = mkdtempSync(path.join(tmpdir(), 'fable-mjs-unowned-'));
const unownedAgent = path.join(UNOWNED, '.claude', 'agents', 'fable-readonly-verifier.md');
const unownedGate = path.join(UNOWNED, '.claude', 'hooks', 'fable-readonly-verifier-gate.js');
const unownedAgentBytes = 'user-owned verifier agent\nbyte-exact sentinel\n';
const unownedGateBytes = '#!/usr/bin/env node\nuser-owned verifier gate\n';
mkdirSync(path.dirname(unownedAgent), { recursive: true });
mkdirSync(path.dirname(unownedGate), { recursive: true });
writeFileSync(path.join(UNOWNED, '.claude', 'settings.json'), '{}\n');
writeFileSync(unownedAgent, unownedAgentBytes);
writeFileSync(unownedGate, unownedGateBytes);
const unownedUninstall = runAt(UNOWNED, '--uninstall');
t(unownedUninstall.status === 0, 'install.mjs: default uninstall with unowned verifier files exits 0');
t(rd(unownedAgent) === unownedAgentBytes && rd(unownedGate) === unownedGateBytes,
  'install.mjs: default uninstall preserves unowned verifier agent + gate byte-exact');

const COLLISION = mkdtempSync(path.join(tmpdir(), 'fable-mjs-gate-collision-'));
const collisionGate = path.join(COLLISION, '.claude', 'hooks', 'fable-readonly-verifier-gate.js');
mkdirSync(path.dirname(collisionGate), { recursive: true });
writeFileSync(path.join(COLLISION, '.claude', 'settings.json'), '{}\n');
writeFileSync(collisionGate, unownedGateBytes);
const collision = runAtEnv(
  COLLISION,
  { FABLE_READONLY_VERIFIER: ' true ' },
  '--no-mcp',
  '--no-subagent',
  '--no-onboard',
  '--no-modelcheck',
  '--no-update-check',
);
t(collision.status !== 0 && rd(collisionGate) === unownedGateBytes,
  'install.mjs: flag-on refuses to overwrite an unowned verifier gate');

rmSync(SB, { recursive: true, force: true });
rmSync(XV, { recursive: true, force: true });
rmSync(SA, { recursive: true, force: true });
rmSync(RO, { recursive: true, force: true });
rmSync(UNOWNED, { recursive: true, force: true });
rmSync(COLLISION, { recursive: true, force: true });
console.log(`install-mjs selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
