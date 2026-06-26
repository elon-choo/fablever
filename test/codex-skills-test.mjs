// codex-skills-test.mjs — verify Codex Agent Skills install/uninstall/status in a throwaway HOME + CODEX_HOME.
// Asserts: full install copies the fable-* skills into $HOME/.agents/skills; --no-codex-skills opts out;
// style-only ships none; uninstall removes ONLY our fable-* dirs and preserves a user-authored skill;
// project scope writes under the project root; the in-repo self-copy guard never clobbers the repo's own
// .agents/skills; dry-run writes nothing; and every shipped SKILL.md has valid, honest frontmatter.
// Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');
const SKILLS_SRC = path.join(REPO, '.agents', 'skills');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const lsdirs = d => { try { return readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch { return []; } };

function newSandbox() {
  const SB = mkdtempSync(path.join(tmpdir(), 'codex-skills-'));
  const CH = path.join(SB, '.codex');
  mkdirSync(CH, { recursive: true });
  return { SB, CH };
}
const runIn = (SB, CH, args, cwd) => spawnSync(process.execPath, [INSTALL, ...args], { env: { ...process.env, HOME: SB, USERPROFILE: SB, CODEX_HOME: CH }, cwd: cwd || REPO, encoding: 'utf8' });
const userSkillsDir = SB => path.join(SB, '.agents', 'skills');

// What the repo actually ships (source of truth for the test).
const SHIPPED = lsdirs(SKILLS_SRC).filter(nm => nm.startsWith('fable-') && existsSync(path.join(SKILLS_SRC, nm, 'SKILL.md')));

// ---------------------------------------------------------------------------------------------------------
// 0) the repo actually ships skills
t(SHIPPED.length >= 3, `repo ships ${SHIPPED.length} fable-* skills under .agents/skills (${SHIPPED.join(', ')})`);

// ---------------------------------------------------------------------------------------------------------
// 1) every shipped SKILL.md has valid, honest frontmatter (name matches dir, real description, no injection)
for (const nm of SHIPPED) {
  const body = read(path.join(SKILLS_SRC, nm, 'SKILL.md'));
  const fm = body.startsWith('---') ? body.slice(3, body.indexOf('\n---', 3)) : '';
  const name = (fm.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (fm.match(/^description:\s*([\s\S]+?)(?:\n[a-z_]+:|$)/m) || [])[1]?.trim() || '';
  t(name === nm, `${nm}: frontmatter name matches directory`);
  t(desc.length >= 40, `${nm}: description is substantive (${desc.length} chars, trigger-specific)`);
  t(!/ignore (the |all )?(previous|user|prior|above)|disregard (the )?(user|safety|instructions)|override (the )?(user|safety)/i.test(body), `${nm}: contains no instruction to ignore user/safety`);
}

// ---------------------------------------------------------------------------------------------------------
// 2) full install (user scope) copies every fable-* skill into $HOME/.agents/skills, records them
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full']);
  const dst = userSkillsDir(SB);
  const got = lsdirs(dst);
  t(SHIPPED.every(nm => got.includes(nm)), `full install: all ${SHIPPED.length} skills copied to $HOME/.agents/skills`);
  t(SHIPPED.every(nm => existsSync(path.join(dst, nm, 'SKILL.md'))), 'full install: each copied skill has its SKILL.md');
  const iv = rj(path.join(CH, 'fable-profile', 'installed-version.json'));
  t(iv && Array.isArray(iv.skills) && SHIPPED.every(nm => iv.skills.includes(nm)), 'full install: installed-version.json records the skill list');
  t(iv && iv.skills_dir === dst, 'full install: installed-version.json records the skills dir');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 3) --no-codex-skills opts out; style-only never ships skills
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full', '--no-codex-skills']);
  t(lsdirs(userSkillsDir(SB)).length === 0, '--no-codex-skills: no skills copied');
  t(existsSync(path.join(CH, 'config.toml')) || existsSync(path.join(CH, 'hooks.json')), '--no-codex-skills: rest of full install still ran');
  rmSync(SB, { recursive: true, force: true });

  const s2 = newSandbox();
  runIn(s2.SB, s2.CH, ['--codex-style-only']);
  t(lsdirs(userSkillsDir(s2.SB)).length === 0, 'style-only: no skills copied');
  rmSync(s2.SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 4) --codex-status reports the installed skills
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full']);
  const r = runIn(SB, CH, ['--codex-status', '--json']);
  let s = null; try { s = JSON.parse(r.stdout); } catch {}
  t(s && Array.isArray(s.skills_installed) && SHIPPED.every(nm => s.skills_installed.includes(nm)), 'status --json: lists installed skills');
  t(s && s.skills_dir === userSkillsDir(SB), 'status --json: reports the skills dir');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 5) uninstall removes ONLY our fable-* skills; a user-authored skill is preserved
{
  const { SB, CH } = newSandbox();
  const dst = userSkillsDir(SB);
  mkdirSync(path.join(dst, 'my-own'), { recursive: true });
  writeFileSync(path.join(dst, 'my-own', 'SKILL.md'), '---\nname: my-own\ndescription: a user skill\n---\nkeep me\n');
  runIn(SB, CH, ['--codex-full']);
  t(lsdirs(dst).includes('my-own') && SHIPPED.every(nm => lsdirs(dst).includes(nm)), 'install alongside a user skill: both present');
  runIn(SB, CH, ['--uninstall', '--codex']);
  const after = lsdirs(dst);
  t(SHIPPED.every(nm => !after.includes(nm)), 'uninstall: all fablever skills removed');
  t(after.includes('my-own') && read(path.join(dst, 'my-own', 'SKILL.md')).includes('keep me'), 'uninstall: user-authored skill preserved (dir not pruned)');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 6) uninstall with NO other skills prunes the empty .agents/skills dir
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full']);
  runIn(SB, CH, ['--uninstall', '--codex']);
  t(!existsSync(userSkillsDir(SB)), 'uninstall: empty .agents/skills pruned when nothing else lived there');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 7) project scope writes skills under the project root, not $HOME
{
  const { SB, CH } = newSandbox();
  const proj = path.join(SB, 'proj'); mkdirSync(proj, { recursive: true });
  runIn(SB, CH, ['--codex-full', '--codex-scope=project'], proj);
  const projSkills = path.join(proj, '.agents', 'skills');
  t(SHIPPED.every(nm => existsSync(path.join(projSkills, nm, 'SKILL.md'))), 'project scope: skills under <project>/.agents/skills');
  t(lsdirs(userSkillsDir(SB)).length === 0, 'project scope: nothing written to $HOME/.agents/skills');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 8) in-repo self-copy guard: project-scope dry-run from REPO recognizes source == destination, writes nothing
{
  const { SB, CH } = newSandbox();
  const before = lsdirs(SKILLS_SRC);
  const r = runIn(SB, CH, ['--codex-full', '--codex-scope=project', '--dry-run', '--json'], REPO);
  let plan = null; try { plan = JSON.parse(r.stdout); } catch {}
  const noteHit = plan && Array.isArray(plan.notes) && plan.notes.some(x => /source == destination/i.test(x));
  t(noteHit, 'self-copy guard: project-scope dry-run in repo flags source == destination');
  t(!plan?.creates?.some(x => /\.agents[\/\\]skills/.test(String(x))), 'self-copy guard: plan creates no .agents/skills entries for the repo itself');
  t(JSON.stringify(lsdirs(SKILLS_SRC)) === JSON.stringify(before), 'self-copy guard: repo .agents/skills untouched');
  rmSync(SB, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
// 9) dry-run writes no skills
{
  const { SB, CH } = newSandbox();
  runIn(SB, CH, ['--codex-full', '--dry-run']);
  t(lsdirs(userSkillsDir(SB)).length === 0, 'dry-run: no skills written');
  rmSync(SB, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
