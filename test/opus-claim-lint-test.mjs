// Offline bidirectional oracle for the preventive Opus/parallel claim lint.
// Every seeded phrasing runs separately, then clean fixtures and the actual repo tree must pass.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = path.join(REPO, 'eval', 'opus-claim-lint', 'run.mjs');
const OPUS_RULE = 'opus-magnitude-without-rebaseline';
const PARALLEL_RULE = 'parallel-beats-solo-without-controlled-ab';

let ok = 0;
let n = 0;
const t = (condition, message) => {
  n++;
  if (condition) {
    ok++;
    console.log('PASS:', message);
  } else {
    console.log('FAIL:', message);
  }
};
const runLint = (...inputs) => spawnSync(process.execPath, [LINT, ...inputs], {
  cwd: REPO,
  encoding: 'utf8',
});
const failureDetail = result => (result.stderr || result.stdout || '').trim().split('\n').slice(0, 2).join(' | ');

const root = mkdtempSync(path.join(tmpdir(), 'opus-claim-lint-'));
try {
  const lintSource = readFileSync(LINT, 'utf8');
  t(
    lintSource.includes('heuristic tripwire; pair with fresh review'),
    'lint header labels the narrow regex honestly as a heuristic tripwire requiring fresh review',
  );

  const magnitudeCases = [
    ['percent-gain', 'Opus gains 18% with the Fable Loop.'],
    ['multiplier-better', 'On Opus, this is 2× better.'],
    ['verb-first-boost', 'The new harness boosts Opus performance by 24%.'],
    ['plus-points', 'On Opus, +7 points on task completion.'],
    ['sessions-improved', 'Opus sessions improved by 31% after enabling the gate.'],
    ['percent-word', 'This improves Opus by 12 percent (rebaseline row forthcoming).'],
    ['quoted-claim', 'The release note says: "Opus gains 9% with the new loop."'],
    ['no-cost-evasion', 'Opus gains 20% with no added latency.'],
    ['mixed-caveat', 'Opus gains 18% on hard tasks, but does not increase cost.'],
    ['and-caveat', 'Opus gains 18% on hard tasks and does not increase cost.'],
  ];

  for (const [id, text] of magnitudeCases) {
    const file = path.join(root, `${id}.md`);
    writeFileSync(file, `${text}\n`);
    const result = runLint(file);
    const passed = result.status !== 0 && result.stderr.includes(OPUS_RULE);
    t(passed, `seeded Opus magnitude phrasing "${text}" fails with ${OPUS_RULE}${passed ? '' : ` — ${failureDetail(result)}`}`);
  }

  const bogusResultPath = path.join(REPO, 'eval', 'comparison', 'results-template.md');
  t(existsSync(bogusResultPath), 'bogus-citation seed uses an existing results-shaped template, not a missing path');
  const parallelCases = [
    ['direct', 'Parallel agents beat a solo agent on hard tasks.'],
    ['mixed-caveat', 'Parallel agents beat a solo agent, but do not help on easy tasks.'],
    ['although-caveat', 'Parallel agents beat a solo agent, although they do not help on easy tasks.'],
    ['bogus-existing-result', 'Parallel agents beat a solo agent. See eval/comparison/results-template.md.'],
    ['quoted-claim', 'The release says: "Parallel agents beat a solo agent on hard tasks."'],
    ['quoted-wording', 'The release wording is explicit: "Parallel agents beat a solo agent on hard tasks."'],
  ];
  for (const [id, text] of parallelCases) {
    const file = path.join(root, `parallel-${id}.md`);
    writeFileSync(file, `${text}\n`);
    const result = runLint(file);
    const passed = result.status !== 0 && result.stderr.includes(PARALLEL_RULE);
    t(passed, `seeded uncited phrasing "${text}" fails with ${PARALLEL_RULE}${passed ? '' : ` — ${failureDetail(result)}`}`);
  }

  const cleanDir = path.join(root, 'clean');
  mkdirSync(cleanDir);
  writeFileSync(path.join(cleanDir, 'clean.md'), [
    '# Honest near-misses',
    '',
    'Fable is ~2× terser than Opus; this is a surface proxy, not correctness.',
    'The panel did not beat the prompt-matched solo agent.',
    'Do not claim the loop improves Opus by 20%.',
    'No evidence shows that Opus gains 20%.',
    'The current Opus holdout assigns about 20% untreated; no outcome is claimed.',
    'The panel beats the single baseline slightly (controlled A/B: `eval/results-2026-06-15-hard.md`).',
    '',
    'The panel beats the single baseline slightly.[^controlled-ab]',
    '',
    'Footnote spacing line 1.',
    'Footnote spacing line 2.',
    'Footnote spacing line 3.',
    'Footnote spacing line 4.',
    'Footnote spacing line 5.',
    'Footnote spacing line 6.',
    'Footnote spacing line 7.',
    '',
    '[^controlled-ab]: Controlled A/B: `eval/results-2026-06-15-hard.md`.',
    '',
  ].join('\n'));
  const cleanResult = runLint(cleanDir);
  const cleanPassed = cleanResult.status === 0;
  t(cleanPassed, `clean fixture passes, including inline and distant-footnote controlled-A/B citations${cleanPassed ? '' : ` — ${failureDetail(cleanResult)}`}`);

  const repoResult = runLint();
  const repoPassed = repoResult.status === 0;
  t(repoPassed, `actual README/EVIDENCE/EVALS/docs tree passes${repoPassed ? '' : ` — ${failureDetail(repoResult)}`}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
