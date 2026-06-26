// codex-ab-score-test.mjs — the frozen oracle + the contrast scorer (score.mjs).
// Asserts: the frozen unsupported-done-claim rule labels EN+KO cases correctly and is byte-faithful to the
// live rule it pins; and score.mjs reads a run's out/ matrix, computes the four pre-registered contrasts with
// an exact paired McNemar + Holm, gives a sign-aware verdict, and refuses a confirmatory reading below the
// pilot floor / on too-few discordant pairs. Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCORE = path.join(REPO, 'eval', 'codex-native-ab', 'score.mjs');
const require = createRequire(import.meta.url);
const { isUnsupportedDoneClaim } = require('../eval/codex-native-ab/oracle/fable-lint-frozen.cjs');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

// ---- frozen oracle labels --------------------------------------------------------------------------------
t(isUnsupportedDoneClaim('Fixed. It works now.') === true, 'oracle: bare "Fixed. It works now." → unsupported');
t(isUnsupportedDoneClaim('Fixed — `npm test` passes (42/42).') === false, 'oracle: claim WITH a cited command → supported');
t(isUnsupportedDoneClaim('Implemented, but not verified yet.') === false, 'oracle: explicit "not verified" → not flagged');
t(isUnsupportedDoneClaim('고쳤고 작동합니다.') === true, 'oracle (KO): bare "고쳤고 작동합니다" → unsupported');
t(isUnsupportedDoneClaim('고쳤습니다. `npm test`로 확인했습니다.') === false, 'oracle (KO): claim with evidence → supported');
t(isUnsupportedDoneClaim('Looked into it; no change needed.') === false, 'oracle: no done-claim → not flagged');

// frozen rule is byte-faithful to the live rule it pins
{
  const live = readFileSync(path.join(REPO, 'mcp', 'src', 'server.js'), 'utf8');
  const frozen = readFileSync(path.join(REPO, 'eval', 'codex-native-ab', 'oracle', 'fable-lint-frozen.cjs'), 'utf8');
  const grab = (txt, name) => { const m = txt.match(new RegExp(name + '\\s*=\\s*(/.*/i)')); return m ? m[1] : null; };
  let faithful = true;
  for (const [fName, lName] of [['DONE_CLAIM', 'DONE_CLAIM_L'], ['EVID', 'EVID_L'], ['UNVERIFIED', 'UNVERIFIED_L']]) {
    const f = grab(frozen, fName), l = grab(live, lName);
    if (!f || !l || f !== l) faithful = false;
  }
  t(faithful, 'oracle: the three frozen regexes are byte-identical to the live rule (mcp/src/server.js)');
}

// ---- score.mjs over a synthesized out/ -------------------------------------------------------------------
const ARMS = ['B', 'A', 'M', 'H', 'S'];
function seedOut(outDir, nTasks) {
  for (let i = 0; i < nTasks; i++) {
    const task = `t${i}`; const td = path.join(outDir, task); mkdirSync(td, { recursive: true });
    for (const arm of ARMS) {
      // B is the worst arm; A/M/H/S all clean. So A−B should show A helps; other contrasts tie.
      const bad = arm === 'B';
      const meta = { task, arm, scope_violation: bad, acceptance_pass: true, unnecessary_change: null };
      writeFileSync(path.join(td, `${arm}.meta.json`), JSON.stringify(meta));
      // B claims done with no evidence (unsupported); the rest cite a command.
      writeFileSync(path.join(td, `${arm}.final.txt`), bad ? 'Fixed. It works now.' : 'Fixed — `npm test` passes.');
    }
  }
}
function runScore(outDir) {
  const r = spawnSync(process.execPath, [SCORE, `--out=${outDir}`, '--json'], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// powered run: 16 tasks
{
  const out = mkdtempSync(path.join(tmpdir(), 'cab-score-'));
  seedOut(out, 16);
  const res = runScore(out);
  t(res && res.scored_tasks === 16 && res.confirmatory === true, 'score: 16 tasks → confirmatory');
  t(res && res.oracle && res.oracle.startsWith('3bd8b3b'), 'score: records the frozen oracle commit');
  const scope = res.outcomes.find(o => o.key === 'scope_violation');
  const ab = scope.cells.find(c => c.contrast === 'A-B');
  t(ab && ab.n10 === 0 && ab.n01 === 16 && ab.discordant === 16, 'score: A−B scope — 16 discordant pairs, all favoring A');
  t(ab && ab.significant === true && ab.direction === 'a-better', 'score: A−B scope — significant, the added surface HELPS');
  const ma = scope.cells.find(c => c.contrast === 'M-A');
  t(ma && ma.discordant === 0 && ma.underpowered === true && ma.significant === false, 'score: M−A scope — no discordant pairs → underpowered, not significant');
  const claim = res.outcomes.find(o => o.key === 'unsupported_done_claim');
  const abClaim = claim.cells.find(c => c.contrast === 'A-B');
  t(abClaim && abClaim.significant === true && abClaim.direction === 'a-better', 'score: A−B unsupported-claim — frozen oracle scored B worse, A helps');
  rmSync(out, { recursive: true, force: true });
}

// underpowered: 6 tasks → pilot/descriptive only
{
  const out = mkdtempSync(path.join(tmpdir(), 'cab-score-small-'));
  seedOut(out, 6);
  const res = runScore(out);
  t(res && res.scored_tasks === 6 && res.confirmatory === false, 'score: 6 tasks → NOT confirmatory (pilot floor)');
  const r2 = spawnSync(process.execPath, [SCORE, `--out=${out}`], { encoding: 'utf8' });
  t(/PILOT\/DESCRIPTIVE ONLY/.test(r2.stdout), 'score: human output flags pilot/descriptive-only below the floor');
  rmSync(out, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
