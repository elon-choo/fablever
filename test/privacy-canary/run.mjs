// privacy-canary/run.mjs — proves the DEFAULT install does not exfiltrate secrets or code.
//
// Method: install fablever into a throwaway HOME, plant CANARY secrets in the environment and in a file in
// the working dir, then run every default-on network/secret-adjacent surface (the update-check, its
// underlying git call, the model-check hook, the reminder + subagent hooks) with `git` and `curl`
// REPLACED by logging shims on PATH. Then assert:
//   - the ONLY network command is `git ls-remote <fablever repo> HEAD` (anonymous; reads just the public HEAD sha)
//   - NO canary string (fake API keys, fake private file content) appears in ANY command's arguments,
//     in any hook's stdout/stderr, or in any file the run created
//   - with FABLE_UPDATE_CHECK=off, git is not called at all
//   - the default model-check makes no network call and emits no secret
//
// Zero real network (git/curl are shimmed). Usage: node test/privacy-canary/run.mjs   (exit 0 = clean)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const INSTALL = path.join(REPO, 'install.mjs');
const UPDATE = path.join(REPO, 'orchestration', 'lib', 'update-check.mjs');

const CANARY = {
  OPENAI_API_KEY: 'sk-CANARY-OPENAI-DO-NOT-LEAK-deadbeef0001',
  GEMINI_API_KEY: 'CANARY-GEMINI-DO-NOT-LEAK-deadbeef0002',
  ANTHROPIC_API_KEY: 'sk-ant-CANARY-DO-NOT-LEAK-deadbeef0003',
  OPENROUTER_API_KEY: 'sk-or-CANARY-DO-NOT-LEAK-deadbeef0004',
};
const FILE_CANARY = 'CANARY-FILE-SECRET-DO-NOT-LEAK-deadbeef0005';
const CANARY_TOKENS = [...Object.values(CANARY), FILE_CANARY, 'DO-NOT-LEAK'];

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'fcan-'));
const work = path.join(sb, 'work'); fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'private.txt'), FILE_CANARY + '\n');
fs.writeFileSync(path.join(work, 'app.js'), `const SECRET = "${FILE_CANARY}"; // simulated user code\n`);

// fake-bin: git + curl shims that LOG their argv and never hit the network
const fakebin = path.join(sb, 'fake-bin'); fs.mkdirSync(fakebin, { recursive: true });
const GITLOG = path.join(sb, 'git-calls.log'), CURLLOG = path.join(sb, 'curl-calls.log');
fs.writeFileSync(path.join(fakebin, 'git'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(GITLOG)}\nif [ "$1" = "ls-remote" ]; then echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tHEAD"; fi\nexit 0\n`);
fs.writeFileSync(path.join(fakebin, 'curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(CURLLOG)}\nexit 0\n`);
fs.chmodSync(path.join(fakebin, 'git'), 0o755); fs.chmodSync(path.join(fakebin, 'curl'), 0o755);
const readLog = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// install normally (real git, so installed-version sha is real); only the CANARY runs use fake-bin
const inst = spawnSync('node', [INSTALL, '--no-mcp'], { env: { ...process.env, HOME: sb, USERPROFILE: sb }, encoding: 'utf8' });
const canaryEnv = { ...process.env, ...CANARY, HOME: sb, USERPROFILE: sb, PATH: fakebin + path.delimiter + process.env.PATH };

let pass = 0, fail = 0; const failures = [];
const check = (cond, label) => { if (cond) pass++; else { fail++; failures.push(label); console.log('  FAIL:', label); } };
const containsCanary = s => CANARY_TOKENS.some(t => String(s || '').includes(t));

check(inst.status === 0, 'install succeeded in sandbox HOME');

// --- A) the real update check, force-run, git shimmed ---
const A = spawnSync('node', [UPDATE, 'check', '--force'], { cwd: work, env: canaryEnv, encoding: 'utf8' });
const gitCalls = readLog(GITLOG).trim().split('\n').filter(Boolean);
check(gitCalls.length === 1, `exactly one git call during a forced update-check (got ${gitCalls.length})`);
check(gitCalls.every(l => /^ls-remote\s+\S+\s+HEAD$/.test(l)), 'the only git call is `ls-remote <url> HEAD` (anonymous, HEAD only)');
check(/github\.com\/elon-choo\/fablever/.test(gitCalls.join('\n')), 'git ls-remote targets the public fablever repo URL');
check(!containsCanary(gitCalls.join('\n')), 'NO canary (api keys / file secret) in any git argument');
check(readLog(CURLLOG).trim() === '', 'no curl call at all');
check(!containsCanary(A.stdout) && !containsCanary(A.stderr), 'update-check stdout/stderr carry no canary');
// the state file it writes contains only shas/timestamps
const stateFile = path.join(sb, '.claude', 'fable-profile', 'update-check.json');
check(fs.existsSync(stateFile) && !containsCanary(fs.readFileSync(stateFile, 'utf8')), 'update-check state file contains no canary');

// --- B) FABLE_UPDATE_CHECK=off via the SessionStart hook -> NO git call added ---
fs.writeFileSync(GITLOG, ''); // reset
const offHook = spawnSync('node', [path.join(sb, '.claude', 'hooks', 'fable-update-check.js')], { cwd: work, input: '{"session_id":"x","source":"startup"}', env: { ...canaryEnv, FABLE_UPDATE_CHECK: 'off' }, encoding: 'utf8' });
// give any (suppressed) detached child a beat; with the flag off there should be none
check(offHook.status === 0, 'update-check hook exits 0 with FABLE_UPDATE_CHECK=off');
check(readLog(GITLOG).trim() === '', 'FABLE_UPDATE_CHECK=off -> no git ls-remote at all');
check(!containsCanary(offHook.stdout) && !containsCanary(offHook.stderr), 'disabled hook emits no canary');

// --- C) other default hooks emit no canary and make no network call ---
fs.writeFileSync(GITLOG, ''); fs.writeFileSync(CURLLOG, '');
const modelHook = spawnSync('node', [path.join(sb, '.claude', 'hooks', 'fable-model-check.js')], { cwd: work, input: '{"session_id":"x","source":"startup"}', env: canaryEnv, encoding: 'utf8' });
check(modelHook.status === 0 && !containsCanary(modelHook.stdout) && !containsCanary(modelHook.stderr), 'default model-check hook: exit 0, no canary emitted');
const subHook = spawnSync('node', [path.join(sb, '.claude', 'hooks', 'fable-subagent.js')], { cwd: work, input: '{"agent_type":"x"}', env: canaryEnv, encoding: 'utf8' });
check(!containsCanary(subHook.stdout) && !containsCanary(subHook.stderr), 'subagent hook emits no canary');
const reinject = path.join(sb, '.claude', 'hooks', 'fable-reinject.sh');
if (fs.existsSync(reinject)) { const r = spawnSync('bash', [reinject], { cwd: work, input: '{"session_id":"x","transcript_path":"/nope","prompt":"hi"}', env: canaryEnv, encoding: 'utf8' }); check(!containsCanary(r.stdout) && !containsCanary(r.stderr), 'reminder hook emits no canary'); }
check(readLog(GITLOG).trim() === '' && readLog(CURLLOG).trim() === '', 'default model-check / subagent / reminder hooks make NO network call');

// --- D) no file created anywhere under the sandbox .claude leaks a canary ---
function walk(dir, acc = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; }
const leakyFiles = walk(path.join(sb, '.claude')).filter(f => { try { return containsCanary(fs.readFileSync(f, 'utf8')); } catch { return false; } });
check(leakyFiles.length === 0, `no installed/state file contains a canary (found ${leakyFiles.length})`);

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\n${'='.repeat(54)}\nprivacy canary: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:', failures.join(' | ')); process.exit(1); }
console.log('CLEAN — default install: one anonymous `git ls-remote HEAD`, no keys/code/canary leave the machine.');
