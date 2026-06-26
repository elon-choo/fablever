// codex-ab-judge-test.mjs — the blind quality judge (judge.mjs), driven by fake adapters.
// Asserts: a content-based judge's consistent preference is counted and sign-tested; the order-swap catches a
// POSITION-biased judge (every pair inconsistent → nothing decided); the judge requires an adapter and never
// needs a key; and it refuses a read below the decided-pair floor. Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JUDGE = path.join(REPO, 'eval', 'codex-native-ab', 'judge.mjs');
const FAKE_JUDGE = path.join(REPO, 'test', 'fixtures', 'fake-judge.js');
const FAKE_JUDGE_POS = path.join(REPO, 'test', 'fixtures', 'fake-judge-positional.js');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

// seed out/: arm A cites evidence, arm B does not (so a content judge prefers A regardless of order)
function seedOut(outDir, nTasks) {
  for (let i = 0; i < nTasks; i++) {
    const td = path.join(outDir, `t${i}`); mkdirSync(td, { recursive: true });
    for (const arm of ['B', 'A', 'M', 'H', 'S']) writeFileSync(path.join(td, `${arm}.meta.json`), JSON.stringify({ task: `t${i}`, arm }));
    writeFileSync(path.join(td, 'A.final.txt'), 'Fixed the bug. Verified with `npm test` (passes).');
    writeFileSync(path.join(td, 'B.final.txt'), 'Fixed. It works now.');
    // M/H/S mirror A so only A-B is interesting here
    for (const arm of ['M', 'H', 'S']) writeFileSync(path.join(td, `${arm}.final.txt`), 'Fixed the bug. Verified with `npm test` (passes).');
  }
}
const runJudge = (outDir, judgeCmd, extra = []) => { const r = spawnSync(process.execPath, [JUDGE, `--judge-cmd=${judgeCmd}`, '--contrast=A-B', `--out=${outDir}`, '--json', ...extra], { encoding: 'utf8' }); try { return JSON.parse(r.stdout); } catch { return null; } };

// 1) content-based judge: A preferred consistently, significant
{
  const out = mkdtempSync(path.join(tmpdir(), 'cab-judge-'));
  seedOut(out, 12);
  const res = runJudge(out, FAKE_JUDGE);
  const ab = res && res.contrasts[0];
  t(ab && ab.decided === 12 && ab.inconsistent === 0, 'judge: a content-based judge decides every pair (no position bias)');
  t(ab && ab.A_preferred === 12 && ab.B_preferred === 0, 'judge: the evidence-citing arm (A) is preferred in all pairs');
  t(ab && ab.p < 0.05 && ab.preferred === 'A', 'judge: sign test is significant → prefers A');
  rmSync(out, { recursive: true, force: true });
}

// 2) position-biased judge: order-swap catches it → nothing decided
{
  const out = mkdtempSync(path.join(tmpdir(), 'cab-judge-pos-'));
  seedOut(out, 12);
  const res = runJudge(out, FAKE_JUDGE_POS);
  const ab = res && res.contrasts[0];
  t(ab && ab.inconsistent === 12 && ab.decided === 0, 'judge: order-swap catches a position-biased judge (all pairs inconsistent)');
  t(ab && ab.underpowered === true && ab.preferred === 'underpowered', 'judge: nothing decided → underpowered, no false preference');
  rmSync(out, { recursive: true, force: true });
}

// 3) below the decided floor → underpowered
{
  const out = mkdtempSync(path.join(tmpdir(), 'cab-judge-small-'));
  seedOut(out, 4);
  const res = runJudge(out, FAKE_JUDGE);
  t(res && res.contrasts[0].decided === 4 && res.contrasts[0].underpowered === true, 'judge: 4 decided pairs → underpowered (below floor)');
  rmSync(out, { recursive: true, force: true });
}

// 4) requires an adapter (and never a key)
{
  const r = spawnSync(process.execPath, [JUDGE, '--out=/tmp/none'], { encoding: 'utf8' });
  t(r.status === 2 && /judge-cmd/.test(r.stderr) && /never reads a key/.test(r.stderr), 'judge: refuses without --judge-cmd; states it never reads a key');
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
