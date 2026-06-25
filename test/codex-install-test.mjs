// codex-install-test.mjs — verify the Codex CLI native install (install.mjs --codex-*) in a throwaway HOME
// and CODEX_HOME, so it never touches the real ~/.codex. Asserts: dry-run writes nothing; style-only vs
// full surfaces; idempotency; marker-only uninstall (AGENTS.md / config.toml restored byte-for-byte,
// hooks.json deep-equal, foreign content preserved); the AGENTS.override + foreign-MCP conflict branches;
// project scope; the installed hooks run; and — load-bearing — that fablever reads/writes NO Codex token.
// No network beyond a best-effort `codex --version` detection. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const sha = p => { try { return crypto.createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } };
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
function walk(dir, acc = []) { let e = []; try { e = readdirSync(dir); } catch { return acc; } for (const f of e) { const p = path.join(dir, f); let s; try { s = statSync(p); } catch { continue; } if (s.isDirectory()) walk(p, acc); else acc.push(p); } return acc; }

function newSandbox() {
  const SB = mkdtempSync(path.join(tmpdir(), 'codex-it-'));
  const CH = path.join(SB, '.codex');
  mkdirSync(CH, { recursive: true });
  return { SB, CH };
}
const runIn = (SB, CH, args, cwd) => spawnSync(process.execPath, [INSTALL, ...args], { env: { ...process.env, HOME: SB, USERPROFILE: SB, CODEX_HOME: CH }, cwd: cwd || REPO, encoding: 'utf8' });

const AGENTS_MARK = '<!-- fablever:codex:start -->';
const TOML_MARK = '# fablever:codex:mcp:start';

// ---------------------------------------------------------------------------------------------------------
// 1) dry-run writes NOTHING
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full', '--dry-run']);
  t(walk(CH).length === 0, 'dry-run (codex-full) writes no files');
  const r = runIn(SB, CH, ['--codex-full', '--dry-run', '--json']);
  let parsed = null; try { parsed = JSON.parse(r.stdout); } catch {}
  t(parsed && parsed.host === 'codex' && Array.isArray(parsed.creates), 'dry-run --json emits a structured plan');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 2) style-only: AGENTS.md marker ONLY — no hooks, no MCP, no runtime
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-style-only']);
  t(read(path.join(CH, 'AGENTS.md')).includes(AGENTS_MARK), 'style-only: AGENTS.md has the fablever marker');
  t(!existsSync(path.join(CH, 'hooks.json')), 'style-only: no hooks.json');
  t(!existsSync(path.join(CH, 'config.toml')), 'style-only: no config.toml');
  t(!existsSync(path.join(CH, 'fable-profile', 'runtime')), 'style-only: no runtime copy');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 3) full install surfaces + idempotency + marker-only uninstall (byte/deep-equal restore, foreign preserved)
{
  const { SB, CH } = newSandbox();
  const agentsP = path.join(CH, 'AGENTS.md'), tomlP = path.join(CH, 'config.toml'), hooksP = path.join(CH, 'hooks.json');
  // pre-existing user content in all three
  writeFileSync(agentsP, '# My project\n\nUse tabs.\n');
  writeFileSync(tomlP, 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "keep"\n');
  const origHooks = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node /my/own.js' }] }] }, model: 'gpt-5' };
  writeFileSync(hooksP, JSON.stringify(origHooks, null, 2) + '\n');
  const aSha0 = sha(agentsP), tSha0 = sha(tomlP);

  runIn(SB, CH, ['--codex-full']);
  t(read(agentsP).includes(AGENTS_MARK), 'full: AGENTS.md patched with marker');
  t(read(agentsP).includes('Use tabs.'), 'full: pre-existing AGENTS content preserved');
  t(read(tomlP).includes(TOML_MARK) && read(tomlP).includes('command = "keep"'), 'full: config.toml gets marker, foreign table kept');
  const hj = rj(hooksP);
  t(hj.hooks.SessionStart.length === 2 && JSON.stringify(hj).includes('/my/own.js'), 'full: hooks.json adds fablever SessionStart, keeps user hook');
  t(hj.hooks.SubagentStart && hj.hooks.SubagentStart.length === 1, 'full: hooks.json adds SubagentStart');
  t(existsSync(path.join(CH, 'fable-profile', 'runtime', 'mcp', 'src', 'server.js')), 'full: runtime mcp server copied');
  t(existsSync(path.join(CH, 'hooks', 'fable-session.js')) && existsSync(path.join(CH, 'hooks', 'fable-subagent.js')), 'full: hook files copied');
  t(rj(path.join(CH, 'fable-profile', 'installed-version.json')).host === 'codex', 'full: installed-version.json host=codex');

  // idempotent
  runIn(SB, CH, ['--codex-full']);
  t((read(agentsP).match(/fablever:codex:start/g) || []).length === 1, 'idempotent: exactly one AGENTS marker after re-install');
  t(rj(hooksP).hooks.SessionStart.filter(e => (e.hooks || []).some(h => /fable-session/.test(h.command))).length === 1, 'idempotent: one fablever SessionStart entry');

  // uninstall → restore
  runIn(SB, CH, ['--uninstall', '--codex']);
  t(sha(agentsP) === aSha0, 'uninstall: AGENTS.md restored byte-for-byte');
  t(sha(tomlP) === tSha0, 'uninstall: config.toml restored byte-for-byte');
  t(JSON.stringify(rj(hooksP)) === JSON.stringify(origHooks), 'uninstall: hooks.json restored deep-equal (user hook + model kept)');
  t(!existsSync(path.join(CH, 'fable-profile', 'runtime')), 'uninstall: runtime removed');
  t(!existsSync(path.join(CH, 'hooks', 'fable-session.js')), 'uninstall: hook files removed');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 4) AGENTS.override.md handling
{
  const { SB, CH } = newSandbox();
  writeFileSync(path.join(CH, 'AGENTS.override.md'), 'override\n');
  runIn(SB, CH, ['--codex-style-only']);
  t(!existsSync(path.join(CH, 'AGENTS.md')), 'override present, no flag: AGENTS.md not created (skipped+warned)');
  t(!read(path.join(CH, 'AGENTS.override.md')).includes(AGENTS_MARK), 'override present, no flag: override not patched');
  runIn(SB, CH, ['--codex-style-only', '--codex-patch-override']);
  t(read(path.join(CH, 'AGENTS.override.md')).includes(AGENTS_MARK), '--codex-patch-override: override file patched');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 5) foreign [mcp_servers.fable-profile] conflict
{
  const { SB, CH } = newSandbox();
  const tomlP = path.join(CH, 'config.toml');
  writeFileSync(tomlP, '[mcp_servers.fable-profile]\ncommand = "OLD"\n');
  runIn(SB, CH, ['--codex-full', '--no-codex-agents', '--no-codex-hooks']);
  t(read(tomlP).includes('OLD') && !read(tomlP).includes(TOML_MARK), 'foreign mcp table: skipped (not overwritten) without --force');
  runIn(SB, CH, ['--codex-full', '--no-codex-agents', '--no-codex-hooks', '--force-codex-mcp']);
  const tomlAfter = read(tomlP);
  t((tomlAfter.match(/^\[mcp_servers\.fable-profile\]/gm) || []).length === 1 && !tomlAfter.includes('OLD') && tomlAfter.includes('FABLE_HOST = "codex"'), '--force-codex-mcp: foreign table stripped, exactly one fable-profile table');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 6) project scope writes to cwd/.codex and cwd/AGENTS.md
{
  const { SB, CH } = newSandbox();
  const proj = path.join(SB, 'proj'); mkdirSync(proj, { recursive: true });
  runIn(SB, CH, ['--codex-full', '--codex-scope=project'], proj);
  t(read(path.join(proj, 'AGENTS.md')).includes(AGENTS_MARK), 'project scope: project-root AGENTS.md patched');
  t(existsSync(path.join(proj, '.codex', 'config.toml')) && existsSync(path.join(proj, '.codex', 'hooks.json')), 'project scope: .codex/config.toml + hooks.json written');
  // The user CODEX_HOME must carry NO fablever artifact. (The real `codex --version` detection may drop the
  // codex binary's own lock/cache/helpers under .codex/tmp; we assert fablever's specific targets are absent,
  // not byte-emptiness.)
  const fableTargets = ['AGENTS.md', 'AGENTS.override.md', 'config.toml', 'hooks.json', 'fable-profile', path.join('hooks', 'fable-session.js')];
  const present = fableTargets.filter(f => existsSync(path.join(CH, f)));
  t(present.length === 0, 'project scope: no fablever artifact in user CODEX_HOME' + (present.length ? ' (' + present.join(',') + ')' : ''));
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 7) PRIVACY — fablever reads/writes NO Codex token (auth.json untouched; token value in no written file)
{
  const { SB, CH } = newSandbox();
  const authP = path.join(CH, 'auth.json');
  writeFileSync(authP, JSON.stringify({ tokens: { access_token: 'SEKRET-AUTH-VALUE-zzz' } }) + '\n');
  const authSha0 = sha(authP);
  const r = spawnSync(process.execPath, [INSTALL, '--codex-full'], { env: { ...process.env, HOME: SB, USERPROFILE: SB, CODEX_HOME: CH, CODEX_ACCESS_TOKEN: 'SEKRET-ENV-TOKEN-yyy' }, cwd: REPO, encoding: 'utf8' });
  t(sha(authP) === authSha0, 'privacy: auth.json is never modified');
  const written = walk(CH).filter(p => p !== authP);
  const leaked = written.filter(p => /SEKRET/.test(read(p)));
  t(leaked.length === 0, 'privacy: no Codex token value appears in any fablever-written file' + (leaked.length ? ' (LEAK: ' + leaked.join(',') + ')' : ''));
  t(!/SEKRET/.test(r.stdout || ''), 'privacy: installer never prints a token value');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 8) installed hooks execute correctly
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full']);
  const sess = path.join(CH, 'hooks', 'fable-session.js');
  const sub = path.join(CH, 'hooks', 'fable-subagent.js');
  const run = (file, input, env) => spawnSync(process.execPath, [file], { input, env: { ...process.env, ...env }, encoding: 'utf8' });
  const startOut = run(sess, '{"source":"startup","session_id":"s1"}', {});
  let parsed = null; try { parsed = JSON.parse(startOut.stdout); } catch {}
  t(parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext.length > 50, 'session hook injects context on startup');
  t(run(sess, '{"source":"resume"}', {}).stdout.trim() === '', 'session hook is a no-op on resume');
  t(run(sess, '{"source":"startup"}', { FABLE_PROFILE: 'off' }).stdout.trim() === '', 'FABLE_PROFILE=off → session hook emits nothing');
  t(run(sub, '{"agent_type":"red-team-validator"}', {}).stdout.trim() === '', 'subagent hook exempts an orchestration role');
  t(run(sub, '{"agent_type":"doc-writer"}', {}).stdout.trim().length > 50, 'subagent hook injects for a normal agent');
  rmSync(SB, { recursive: true, force: true });
}

console.log(`\ncodex-install selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
