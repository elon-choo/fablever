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
const DEFAULT_PLAN = path.join(REPO, 'claude-code', 'skills', 'fable-plan', 'SKILL.md');
const DEFAULT_ORCHESTRATE = path.join(REPO, 'claude-code', 'skills', 'orchestrate', 'SKILL.md');
const UPGRADED_PLAN = path.join(REPO, 'skill', 'optin', 'fable-plan', 'SKILL.md');
const UPGRADED_ORCHESTRATE = path.join(REPO, 'skill', 'optin', 'orchestrate', 'SKILL.md');
const SB = mkdtempSync(path.join(tmpdir(), 'fable-skills-'));
mkdirSync(path.join(SB, '.claude'), { recursive: true });
const skillsDir = path.join(SB, '.claude', 'skills');
const cleanEnv = (home, extra = {}) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.FABLE_ORCHESTRATION_PREFLIGHT;
  delete env.FABLE_READONLY_VERIFIER;
  delete env.FABLE_TASK_CRITERIA;
  return { ...env, ...extra };
};
const runIn = (home, args = [], extra = {}) => spawnSync(
  process.execPath,
  [INSTALL, '--no-mcp', ...args],
  { env: cleanEnv(home, extra), encoding: 'utf8' },
);
const run = (...args) => runIn(SB, args);
const sk = (...p) => path.join(skillsDir, ...p);
const marker = name => existsSync(sk(name, '.fable-skill'));
const rd = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let ok = 0, n = 0; const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

// The opt-in sources must be present in the actual npm artifact, not only in a git checkout.
const packed = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  { cwd: REPO, encoding: 'utf8' },
);
let packFiles = [];
try { packFiles = JSON.parse(packed.stdout)[0].files.map(file => file.path); } catch (_) {}
t(packed.status === 0, 'npm pack dry-run succeeds without scripts or network');
t(packFiles.includes('skill/optin/fable-plan/SKILL.md'), 'npm artifact includes opt-in fable-plan guidance');
t(packFiles.includes('skill/optin/orchestrate/SKILL.md'), 'npm artifact includes opt-in orchestrate guidance');

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
t(rd(sk('fable-plan', 'SKILL.md')) === rd(DEFAULT_PLAN), 'install: default fable-plan bytes match the HEAD-compatible source');
t(marker('fable-handoff'), 'install: fable-handoff delivered + marked');
t(rd(sk('orchestrate', 'SKILL.md')).includes('USER ORCHESTRATE'), 'install: user-authored "orchestrate" left VERBATIM (clobber-protected)');
t(!marker('orchestrate'), 'install: user "orchestrate" never marked as fablever-owned');
t(rd(sk('my-own', 'SKILL.md')) === 'user skill\n', 'install: unrelated user skill untouched');

// 2) style-only install must NOT deliver skills (minimal surface promise)
const SB2 = mkdtempSync(path.join(tmpdir(), 'fable-skills2-'));
mkdirSync(path.join(SB2, '.claude'), { recursive: true });
runIn(SB2, ['--no-subagent', '--no-onboard', '--no-modelcheck', '--no-update-check']);
t(!existsSync(path.join(SB2, '.claude', 'skills', 'fable-seed')), 'style-only: no skills delivered (pristine minimal surface)');
rmSync(SB2, { recursive: true, force: true });

// 3) --no-skills opts out even on a full install
const SB3 = mkdtempSync(path.join(tmpdir(), 'fable-skills3-'));
mkdirSync(path.join(SB3, '.claude'), { recursive: true });
runIn(SB3, ['--no-skills']);
t(!existsSync(path.join(SB3, '.claude', 'skills', 'fable-seed')), '--no-skills: skills suppressed');
rmSync(SB3, { recursive: true, force: true });

// 4) default skill bytes stay at HEAD; upgraded guidance is selected only by explicit env opt-ins
const SB4 = mkdtempSync(path.join(tmpdir(), 'fable-skills4-'));
mkdirSync(path.join(SB4, '.claude'), { recursive: true });
runIn(SB4);
const sb4Skills = path.join(SB4, '.claude', 'skills');
t(rd(path.join(sb4Skills, 'fable-plan', 'SKILL.md')) === rd(DEFAULT_PLAN), 'default: fable-plan uses HEAD-compatible guidance');
t(rd(path.join(sb4Skills, 'orchestrate', 'SKILL.md')) === rd(DEFAULT_ORCHESTRATE), 'default: orchestrate uses HEAD-compatible guidance');
runIn(SB4, [], {
  FABLE_ORCHESTRATION_PREFLIGHT: 'on',
  FABLE_TASK_CRITERIA: 'on',
});
t(rd(path.join(sb4Skills, 'fable-plan', 'SKILL.md')) === rd(UPGRADED_PLAN), 'opt-in: FABLE_TASK_CRITERIA installs upgraded fable-plan guidance');
t(rd(path.join(sb4Skills, 'orchestrate', 'SKILL.md')) === rd(UPGRADED_ORCHESTRATE), 'opt-in: FABLE_ORCHESTRATION_PREFLIGHT installs upgraded orchestrate guidance');
rmSync(SB4, { recursive: true, force: true });

// 4b) the verifier opt-in also installs the preflight bridge that serializes its agent type
const SB5 = mkdtempSync(path.join(tmpdir(), 'fable-skills5-'));
mkdirSync(path.join(SB5, '.claude'), { recursive: true });
runIn(SB5, [], { FABLE_READONLY_VERIFIER: 'on' });
const sb5Skills = path.join(SB5, '.claude', 'skills');
t(rd(path.join(sb5Skills, 'fable-plan', 'SKILL.md')) === rd(DEFAULT_PLAN), 'read-only verifier opt-in leaves default fable-plan guidance unchanged');
t(rd(path.join(sb5Skills, 'orchestrate', 'SKILL.md')) === rd(UPGRADED_ORCHESTRATE), 'read-only verifier opt-in installs the orchestration preflight bridge');
rmSync(SB5, { recursive: true, force: true });

// 5) uninstall removes ONLY fablever-marked skills; the user's survive; dir not left with our entries
run('--uninstall');
t(!existsSync(sk('fable-seed')), 'uninstall: fable-seed removed');
t(!existsSync(sk('fable-plan')), 'uninstall: fable-plan removed');
t(!existsSync(sk('fable-handoff')), 'uninstall: fable-handoff removed');
t(rd(sk('orchestrate', 'SKILL.md')).includes('USER ORCHESTRATE'), 'uninstall: user "orchestrate" STILL present (never ours to remove)');
t(rd(sk('my-own', 'SKILL.md')) === 'user skill\n', 'uninstall: unrelated user skill STILL present');

rmSync(SB, { recursive: true, force: true });
console.log(`skills-install selftest: ${ok}/${n}`);
process.exit(ok === n ? 0 : 1);
