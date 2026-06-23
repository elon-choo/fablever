// install-matrix.mjs — install/uninstall SAFETY across many synthetic ~/.claude/settings.json fixtures.
// Answers "will installing fablever break or mangle my Claude Code setup?" with a test, not prose.
//
// For each fixture it runs, in a THROWAWAY HOME (never your real ~/.claude):
//   1. install            -> outputStyle becomes Fable; prior style memoized; every unrelated key/hook preserved; backup made
//   2. install again       -> IDEMPOTENT: no fable hook duplicated, settings byte-identical to after step 1
//   3. uninstall           -> settings.json deep-equals the ORIGINAL (prior style restored, fable hooks gone, memo cleaned)
// The headline guarantee is step 3's deep-equality: install then uninstall is a no-op on your settings.
//
// Zero network, zero deps. Usage: node test/install-matrix.mjs   (exit 0 = all fixtures pass)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
function sortedStringify(o) { return JSON.stringify(sortKeys(o)); }
function sortKeys(o) { if (Array.isArray(o)) return o.map(sortKeys); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o).sort()) r[k] = sortKeys(o[k]); return r; } return o; }
const deepEq = (a, b) => sortedStringify(a) === sortedStringify(b);

const FABLE_HOOK_RE = /fable-(subagent|onboard|model-check|update-check|reinject)/;
function hasFableHook(settings) { return FABLE_HOOK_RE.test(JSON.stringify(settings.hooks || {})); }
function readSettings(home) { try { return JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')); } catch { return null; } }
function runInstall(home, args) {
  const r = spawnSync('node', [INSTALL, '--no-mcp', ...args], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
  return r.status;
}

// --- synthetic fixtures: realistic pre-existing ~/.claude/settings.json shapes ---
const FIXTURES = {
  'absent (no settings.json)': null,
  'empty {}': {},
  'custom style + effort': { outputStyle: 'MyCustomStyle', effortLevel: 'high' },
  'rich: hooks+perms+theme': { outputStyle: 'Explanatory', effortLevel: 'xhigh', theme: 'dark', statusLine: { type: 'command', command: 'x.sh' }, permissions: { allow: ['Bash(git*)'], deny: [] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 's.sh' }] }], PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'p.sh' }] }] } },
  'pre-existing UserPromptSubmit hook': { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'mine-ups.sh' }] }] } },
  'pre-existing SubagentStart hook': { hooks: { SubagentStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'mine-sub.sh' }] }] } },
  'pre-existing SessionStart hooks': { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'mine-sess.sh' }] }] } },
  'deeply nested unknown keys': { outputStyle: 'X', custom: { a: { b: [1, 2, { c: 'd' }] } }, mcpServers: { foo: { command: 'bar' } } },
  'combo: style + unrelated hooks + perms': { outputStyle: 'Concise', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'st.sh' }] }], SubagentStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'sa.sh' }] }] }, permissions: { allow: ['Read(*)'], deny: ['Bash(rm*)'] } },
  'outputStyle explicitly null': { outputStyle: null, effortLevel: 'low' },
};

let pass = 0, fail = 0; const failures = [];
function check(cond, label) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL:', label); } }

for (const [name, fixture] of Object.entries(FIXTURES)) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fimx-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (fixture !== null) fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify(fixture, null, 2));
  const original = fixture === null ? null : JSON.parse(JSON.stringify(fixture));
  console.log(`\n# fixture: ${name}`);

  // 1) install
  const s1 = runInstall(home, []);
  const a1 = readSettings(home);
  check(s1 === 0, `${name}: install exit 0`);
  check(a1 && a1.outputStyle === 'Fable', `${name}: outputStyle set to Fable`);
  check(a1 && hasFableHook(a1), `${name}: fable hooks registered`);
  if (original && original.outputStyle != null) check(a1 && a1._fableProfilePrevOutputStyle === original.outputStyle, `${name}: prior style '${original.outputStyle}' memoized`);
  // unrelated keys preserved after install (everything except outputStyle/_fableProfilePrevOutputStyle/hooks must survive verbatim)
  if (original) for (const k of Object.keys(original)) { if (k === 'outputStyle') continue; if (k === 'hooks') continue; check(a1 && deepEq(a1[k], original[k]), `${name}: unrelated key '${k}' preserved on install`); }
  // unrelated pre-existing hooks survive (their command strings still present)
  if (original && original.hooks) for (const ev of Object.keys(original.hooks)) { const before = JSON.stringify(original.hooks[ev]); const cmds = (before.match(/"command":"[^"]+"/g) || []); check(cmds.every(c => JSON.stringify(a1.hooks?.[ev] || []).includes(c)), `${name}: pre-existing ${ev} hook preserved on install`); }
  check(fs.readdirSync(path.join(home, '.claude')).some(f => f.startsWith('settings.json.fable-bak-')), `${name}: settings.json backed up`);

  // 2) install again -> idempotent (byte-identical settings, no hook duplication)
  runInstall(home, []);
  const a2 = readSettings(home);
  check(a2 && deepEq(a1, a2), `${name}: 2nd install is idempotent (settings unchanged)`);
  for (const h of ['fable-subagent', 'fable-onboard', 'fable-model-check', 'fable-update-check']) { const n = (JSON.stringify(a2.hooks || {}).match(new RegExp(h, 'g')) || []).length; check(n <= 1, `${name}: ${h} not duplicated (count=${n})`); }

  // 3) uninstall -> settings.json deep-equals the ORIGINAL
  runInstall(home, ['--uninstall']);
  const a3 = readSettings(home);
  check(!hasFableHook(a3 || {}), `${name}: all fable hooks removed on uninstall`);
  check(!(a3 && '_fableProfilePrevOutputStyle' in a3), `${name}: prev-style memo cleaned on uninstall`);
  if (original === null) {
    // started with no settings.json: after uninstall outputStyle must be gone and no fable hooks remain
    check(a3 == null || a3.outputStyle == null, `${name}: no leftover outputStyle (started absent)`);
  } else {
    check(deepEq(a3, original), `${name}: uninstall restores settings.json to the ORIGINAL (deep-equal)`);
  }
  fs.rmSync(home, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(54)}\ninstall-safety matrix: ${pass} passed, ${fail} failed across ${Object.keys(FIXTURES).length} fixtures`);
if (fail) { console.log('FAILURES:', failures.join(' | ')); process.exit(1); }
console.log('ALL FIXTURES PASS — install is idempotent and uninstall is a clean no-op on your settings.');
