// skills-install-test.mjs — the on-demand Agent Skills wiring is SAFE and REVERSIBLE.
// Answers, with a test not prose: does installing/uninstalling fablever's skills (a) deliver the validated
// on-demand skills, (b) NEVER clobber or remove a user-authored skill, (c) leave ~/.claude/skills clean on
// uninstall? Throwaway HOME; zero network; runs with --no-mcp so no `claude` CLI is needed.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
const SB = mkdtempSync(path.join(tmpdir(), 'fable-skills-'));
mkdirSync(path.join(SB, '.claude'), { recursive: true });
const skillsDir = path.join(SB, '.claude', 'skills');
const run = (...args) => spawnSync(process.execPath, [INSTALL, '--no-mcp', ...args], { env: { ...process.env, HOME: SB, USERPROFILE: SB }, encoding: 'utf8' });
const sk = (...p) => path.join(skillsDir, ...p);
const marker = name => existsSync(sk(name, '.fable-skill'));
const rd = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let ok = 0, n = 0; const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

// Pre-seed TWO user-authored skills that must survive untouched:
//   • 'orchestrate' — collides with a fablever skill NAME but is the user's own (unmarked) → must be SKIPPED, kept verbatim
//   • 'my-own'      — unrelated user skill → must be ignored entirely
mkdirSync(sk('orchestrate'), { recursive: true });
writeFileSync(sk('orchestrate', 'SKILL.md'), 'USER ORCHESTRATE — do not touch\n');
mkdirSync(sk('my-own'), { recursive: true });
writeFileSync(sk('my-own', 'SKILL.md'), 'user skill\n');

// 1) default install delivers the fablever skills, marks them, and does NOT clobber the user's collide-named skill
run();
t(marker('fable-seed') && existsSync(sk('fable-seed', 'SKILL.md')), 'install: fable-seed delivered + marked');
t(marker('fable-plan') && existsSync(sk('fable-plan', 'SKILL.md')), 'install: fable-plan delivered + marked');
t(marker('fable-handoff'), 'install: fable-handoff delivered + marked');
t(rd(sk('orchestrate', 'SKILL.md')).includes('USER ORCHESTRATE'), 'install: user-authored "orchestrate" left VERBATIM (clobber-protected)');
t(!marker('orchestrate'), 'install: user "orchestrate" never marked as fablever-owned');
t(rd(sk('my-own', 'SKILL.md')) === 'user skill\n', 'install: unrelated user skill untouched');

// 2) style-only install must NOT deliver skills (minimal surface promise)
const SB2 = mkdtempSync(path.join(tmpdir(), 'fable-skills2-'));
mkdirSync(path.join(SB2, '.claude'), { recursive: true });
spawnSync(process.execPath, [INSTALL, '--no-mcp', '--no-subagent', '--no-onboard', '--no-modelcheck', '--no-update-check'], { env: { ...process.env, HOME: SB2, USERPROFILE: SB2 }, encoding: 'utf8' });
t(!existsSync(path.join(SB2, '.claude', 'skills', 'fable-seed')), 'style-only: no skills delivered (pristine minimal surface)');
rmSync(SB2, { recursive: true, force: true });

// 3) --no-skills opts out even on a full install
const SB3 = mkdtempSync(path.join(tmpdir(), 'fable-skills3-'));
mkdirSync(path.join(SB3, '.claude'), { recursive: true });
spawnSync(process.execPath, [INSTALL, '--no-mcp', '--no-skills'], { env: { ...process.env, HOME: SB3, USERPROFILE: SB3 }, encoding: 'utf8' });
t(!existsSync(path.join(SB3, '.claude', 'skills', 'fable-seed')), '--no-skills: skills suppressed');
rmSync(SB3, { recursive: true, force: true });

// 4) uninstall removes ONLY fablever-marked skills; the user's survive; dir not left with our entries
run('--uninstall');
t(!existsSync(sk('fable-seed')), 'uninstall: fable-seed removed');
t(!existsSync(sk('fable-plan')), 'uninstall: fable-plan removed');
t(!existsSync(sk('fable-handoff')), 'uninstall: fable-handoff removed');
t(rd(sk('orchestrate', 'SKILL.md')).includes('USER ORCHESTRATE'), 'uninstall: user "orchestrate" STILL present (never ours to remove)');
t(rd(sk('my-own', 'SKILL.md')) === 'user skill\n', 'uninstall: unrelated user skill STILL present');

rmSync(SB, { recursive: true, force: true });
console.log(`skills-install selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
