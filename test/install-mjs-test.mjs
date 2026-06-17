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
const run = (...args) => spawnSync(process.execPath, [INSTALL, ...args], { env: { ...process.env, HOME: SB }, encoding: 'utf8' });
const J = () => JSON.parse(readFileSync(settings, 'utf8'));
const F = p => path.join(SB, '.claude', p);

run('--no-mcp');
t(J().outputStyle === 'Fable', 'install.mjs: outputStyle=Fable');
const ss = JSON.stringify(J().hooks.SessionStart || []);
t(/fable-onboard/.test(ss) && /fable-model-check/.test(ss), 'install.mjs: SessionStart onboard+modelcheck registered');
t(/fable-subagent/.test(JSON.stringify(J().hooks.SubagentStart || [])), 'install.mjs: SubagentStart registered');
t(J().hooks.Stop && J().effortLevel === 'xhigh' && J().permissions.allow.length === 1, 'install.mjs: existing settings preserved');
t(existsSync(F('fable-profile/runtime/orchestration/lib/xverify-preset.mjs')), 'install.mjs: orchestration copied into runtime');
t(existsSync(F('fable-profile/fable-home')), 'install.mjs: fable-home pointer written');
t(JSON.parse(readFileSync(F('fable-profile/mode.json'), 'utf8')).ultra === 'auto', 'install.mjs: mode.json seeded');
t(readFileSync(F('fable-profile/full.md'), 'utf8').length > 500, 'install.mjs: profile resolves');
t(readdirSync(F('')).some(f => f.startsWith('settings.json.fable-bak-')), 'install.mjs: settings backed up');

run('--no-mcp'); // idempotent
t((JSON.stringify(J().hooks.SessionStart).match(/fable-onboard/g) || []).length === 1, 'install.mjs: idempotent (onboard once)');

run('--no-mcp', '--with-xverify=gpt-oauth');
t(JSON.parse(readFileSync(F('fable-profile/xverify.json'), 'utf8')).preset === 'gpt-oauth', 'install.mjs: explicit preset set');
run('--no-mcp'); // plain re-run must preserve
t(JSON.parse(readFileSync(F('fable-profile/xverify.json'), 'utf8')).preset === 'gpt-oauth', 'install.mjs: plain re-run preserves preset');

run('--uninstall');
const after = J();
t(!after.outputStyle && !(after.hooks && after.hooks.SessionStart) && !(after.hooks && after.hooks.SubagentStart) && after.hooks.Stop && after.effortLevel === 'xhigh', 'install.mjs: uninstall clean (kept Stop/effort)');
t(!existsSync(F('output-styles/Fable.md')), 'install.mjs: style file removed on uninstall');

rmSync(SB, { recursive: true, force: true });
console.log(`install-mjs selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
