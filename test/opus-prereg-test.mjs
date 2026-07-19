// opus-prereg-test.mjs — bidirectional oracle for the pre-registration binding lint (G0.4).
// PASS: a prereg registered BEFORE the run, bound to a results file, lints clean (json + markdown paths).
// FAIL: missing prereg, back-dated prereg, malformed prereg (no threshold / no decision verb / bad floor).
// Also asserts the real committed eval/opus-prereg tree is well-formed. Zero network. Exit 0 = all pass.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = path.join(REPO, 'eval', 'opus-prereg', 'lint.mjs');
let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };
const run = (args) => spawnSync(process.execPath, [LINT, ...args], { encoding: 'utf8' });

const root = mkdtempSync(path.join(tmpdir(), 'opus-prereg-'));
try {
  const pdir = path.join(root, 'preregs');
  mkdirSync(pdir, { recursive: true });
  const goodPrereg = {
    experiment_id: 'opus-loop-ab-2026-08',
    registered_at: '2026-08-01T00:00:00Z',
    decision_rule: 'ship iff hidden-test pass-rate gain >= 5pp vs prompt-matched solo control at <= 20% token cost; else park',
    primary_metric: 'hidden-test pass rate',
    co_primary_metrics: ['tokens', 'wall-clock ms'],
    floor_n: 12,
  };
  writeFileSync(path.join(pdir, 'opus-loop-ab-2026-08.prereg.json'), JSON.stringify(goodPrereg, null, 2));

  // ---- mode 1: committed dir well-formed (the single good prereg) ----
  const m1 = run([`--prereg-dir=${pdir}`]);
  t(m1.status === 0, 'mode 1: a well-formed prereg dir lints clean');

  // ---- PASS: results (json) with a prereg registered BEFORE first_run_at ----
  const resJson = path.join(root, 'results-good.json');
  writeFileSync(resJson, JSON.stringify({ experiment_id: 'opus-loop-ab-2026-08', first_run_at: '2026-08-05T10:00:00Z', pass_rate: 0.7 }));
  const passJson = run([`--prereg-dir=${pdir}`, `--results=${resJson}`]);
  t(passJson.status === 0, 'PASS: pre-dated prereg + json results → clean');

  // ---- PASS: markdown results with a prereg-binding comment ----
  const resMd = path.join(root, 'results-good.md');
  writeFileSync(resMd, `# Results\n<!-- prereg-binding: {"experiment_id":"opus-loop-ab-2026-08","first_run_at":"2026-08-05T10:00:00Z"} -->\n\nverdict row here.\n`);
  const passMd = run([`--prereg-dir=${pdir}`, `--results=${resMd}`]);
  t(passMd.status === 0, 'PASS: pre-dated prereg + markdown binding comment → clean');

  // ---- FAIL (a): results referencing an experiment with NO prereg ----
  const resOrphan = path.join(root, 'results-orphan.json');
  writeFileSync(resOrphan, JSON.stringify({ experiment_id: 'opus-UNREGISTERED', first_run_at: '2026-08-05T10:00:00Z' }));
  const failMissing = run([`--prereg-dir=${pdir}`, `--results=${resOrphan}`]);
  t(failMissing.status !== 0 && /NO pre-registration found/.test(failMissing.stderr), 'FAIL: results with no matching prereg → non-zero');

  // ---- FAIL (b): prereg registered_at is AFTER first_run_at (back-dated claim) ----
  const backPrereg = { ...goodPrereg, experiment_id: 'opus-backdated', registered_at: '2026-08-10T00:00:00Z' };
  writeFileSync(path.join(pdir, 'opus-backdated.prereg.json'), JSON.stringify(backPrereg, null, 2));
  const resBack = path.join(root, 'results-back.json');
  writeFileSync(resBack, JSON.stringify({ experiment_id: 'opus-backdated', first_run_at: '2026-08-05T10:00:00Z' }));
  const failBack = run([`--prereg-dir=${pdir}`, `--results=${resBack}`]);
  t(failBack.status !== 0 && /NOT before first_run_at/.test(failBack.stderr), 'FAIL: prereg registered AFTER the run → non-zero');

  // ---- FAIL: malformed prereg — decision_rule with no threshold token ----
  const noThreshDir = path.join(root, 'no-thresh');
  mkdirSync(noThreshDir);
  writeFileSync(path.join(noThreshDir, 'x.prereg.json'), JSON.stringify({ ...goodPrereg, decision_rule: 'ship it if it seems better' }));
  const failThresh = run([`--prereg-dir=${noThreshDir}`]);
  t(failThresh.status !== 0 && /names no threshold/.test(failThresh.stderr), 'FAIL: decision_rule without a threshold → non-zero');

  // ---- FAIL: malformed prereg — decision_rule with no decision verb ----
  const noVerbDir = path.join(root, 'no-verb');
  mkdirSync(noVerbDir);
  writeFileSync(path.join(noVerbDir, 'x.prereg.json'), JSON.stringify({ ...goodPrereg, decision_rule: 'the gain is >= 5pp at <= 20% cost' }));
  const failVerb = run([`--prereg-dir=${noVerbDir}`]);
  t(failVerb.status !== 0 && /names no decision verb/.test(failVerb.stderr), 'FAIL: decision_rule without a decision verb → non-zero');

  // ---- FAIL: malformed prereg — missing required field (floor_n) + bad floor ----
  const noFloorDir = path.join(root, 'no-floor');
  mkdirSync(noFloorDir);
  const { floor_n, ...noFloor } = goodPrereg;
  writeFileSync(path.join(noFloorDir, 'x.prereg.json'), JSON.stringify(noFloor));
  const failFloor = run([`--prereg-dir=${noFloorDir}`]);
  t(failFloor.status !== 0 && /missing required field "floor_n"/.test(failFloor.stderr), 'FAIL: prereg missing floor_n → non-zero');

  // ---- FAIL: results OMITS first_run_at → cannot verify pre-dating; omission must not launder through ----
  const resNoRun = path.join(root, 'results-no-firstrun.json');
  writeFileSync(resNoRun, JSON.stringify({ experiment_id: 'opus-loop-ab-2026-08' }));
  const failNoRun = run([`--prereg-dir=${pdir}`, `--results=${resNoRun}`]);
  t(failNoRun.status !== 0 && /declares no first_run_at/.test(failNoRun.stderr), 'FAIL: results omitting first_run_at → non-zero (no silent no-op bypass)');

  // ---- real committed tree: eval/opus-prereg/**.prereg.json is well-formed ----
  const real = run([]);
  t(real.status === 0, 'real committed eval/opus-prereg tree lints clean (example prereg well-formed)');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
