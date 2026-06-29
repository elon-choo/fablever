// stopgate-test.mjs — the opt-in Stop hook (fable-stopgate.js) ENFORCES correctly, NEVER loops, FAILS OPEN,
// and installs/uninstalls reversibly. Plus: its regexes are byte-identical to the live fable_lint rule, so
// enforcement can never silently drift from the validated, regression-tested rule. Throwaway HOME; no network.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(REPO, 'claude-code', 'hooks', 'fable-stopgate.js');
const INSTALL = path.join(REPO, 'install.mjs');
let ok = 0, n = 0; const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

const SB = mkdtempSync(path.join(tmpdir(), 'fable-stopgate-'));
// Build a minimal Claude Code transcript whose LAST assistant message is `lastText`.
function transcript(lastText) {
  const p = path.join(SB, `t-${n}-${Math.round(process.hrtime()[1])}.jsonl`);
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'do the thing' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: lastText }] } }),
  ];
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}
// Run the hook with a given Stop-event payload; returns { status, decision|null }.
function fire(evt, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(evt), env: { ...process.env, ...env }, encoding: 'utf8' });
  let decision = null;
  try { decision = JSON.parse(r.stdout || '{}').decision || null; } catch (_) {}
  return { status: r.status, decision, stdout: r.stdout };
}

// 1) an UNSUPPORTED done-claim is BLOCKED (one nudge)
t(fire({ transcript_path: transcript('Fixed the bug. It works now.') }).decision === 'block', 'unsupported "Fixed. It works now." → block');
// 2) a claim WITH evidence is ALLOWED (no block)
t(fire({ transcript_path: transcript('Fixed it — `npm test` passes, 12/12.') }).decision === null, 'claim with cited `npm test` passes → allow');
// 3) an explicitly UNVERIFIED claim is ALLOWED
t(fire({ transcript_path: transcript('Implemented the parser, but not verified yet — I have not run the tests.') }).decision === null, 'claim marked "not verified" → allow');
// 4) a message with NO done-claim is ALLOWED
t(fire({ transcript_path: transcript('Here are three options for the layout; which do you prefer?') }).decision === null, 'no done-claim → allow');
// 5) NEVER loops: stop_hook_active=true always allows, even on an unsupported claim
t(fire({ transcript_path: transcript('Fixed. Works now.'), stop_hook_active: true }).decision === null, 'stop_hook_active=true → never blocks again (no loop)');
// 6) kill switch
t(fire({ transcript_path: transcript('Fixed. Works now.') }, { FABLE_STOP_GATE: 'off' }).decision === null, 'FABLE_STOP_GATE=off → disabled');
t(fire({ transcript_path: transcript('Fixed. Works now.') }, { FABLE_PROFILE: 'off' }).decision === null, 'FABLE_PROFILE=off → disabled');
// 7) FAIL OPEN: missing transcript / garbage stdin never traps the user
t(fire({ transcript_path: path.join(SB, 'does-not-exist.jsonl') }).status === 0 && fire({ transcript_path: path.join(SB, 'nope.jsonl') }).decision === null, 'missing transcript → fail open (allow)');
const garbage = spawnSync(process.execPath, [HOOK], { input: 'not json at all', encoding: 'utf8' });
t(garbage.status === 0, 'garbage stdin → exit 0 (fail open)');
// 8) Korean unsupported claim is BLOCKED (rule is bilingual)
t(fire({ transcript_path: transcript('버그 고쳤고 이제 작동합니다.') }).decision === 'block', 'KO unsupported "고쳤고 작동합니다" → block');

// 9) the three regexes are BYTE-IDENTICAL to the live rule (mcp/src/server.js) — no drift
const live = readFileSync(path.join(REPO, 'mcp', 'src', 'server.js'), 'utf8');
const hook = readFileSync(HOOK, 'utf8');
for (const name of ['DONE_CLAIM_L', 'EVID_L', 'UNVERIFIED_L']) {
  const re = new RegExp(`const ${name} = (/.*/[a-z]*);`);
  const a = (live.match(re) || [])[1], b = (hook.match(re) || [])[1];
  t(!!a && a === b, `regex ${name} byte-identical to live fable_lint rule`);
}

// 10) opt-in install REGISTERS a Stop hook; uninstall removes it (reversible). Default install does NOT.
const H = mkdtempSync(path.join(tmpdir(), 'fable-sg-home-'));
mkdirSync(path.join(H, '.claude'), { recursive: true });
const settings = () => { try { return JSON.parse(readFileSync(path.join(H, '.claude', 'settings.json'), 'utf8')); } catch { return {}; } };
const inst = (...a) => spawnSync(process.execPath, [INSTALL, '--no-mcp', ...a], { env: { ...process.env, HOME: H, USERPROFILE: H }, encoding: 'utf8' });
inst(); // default: no stop-gate
t(!/fable-stopgate/.test(JSON.stringify(settings().hooks || {})), 'default install does NOT register the stop-gate (opt-in)');
inst('--with-stop-gate');
t(/fable-stopgate/.test(JSON.stringify(settings().hooks?.Stop || [])), '--with-stop-gate registers a Stop hook');
inst('--uninstall');
t(!/fable-stopgate/.test(JSON.stringify(settings().hooks || {})), 'uninstall removes the stop-gate Stop hook');
t(!existsSync(path.join(H, '.claude', 'hooks', 'fable-stopgate.js')), 'uninstall removes the stop-gate hook file');
rmSync(H, { recursive: true, force: true });

rmSync(SB, { recursive: true, force: true });
console.log(`stopgate selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
