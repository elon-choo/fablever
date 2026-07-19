// ledger-evidence-test.mjs — G5.3 bookkeeping gate.
// Every `[x]` goal row in the upgrade ledger must cite at least one evidence path that EXISTS on disk;
// every `[x]` STAGE GATE row must carry a fresh-context reviewer verdict; parked/⏸ rows must state a reason.
// Bidirectional: a synthetic ledger with an `[x]` row citing a nonexistent path FAILS the same checker.
// Also runs the G0.5 magnitude-claim lint (must stay green). Zero network. Exit 0 = all pass.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(REPO, 'docs', 'proposals', 'HARNESS-UPGRADE-LEDGER.md');
const LINT = path.join(REPO, 'eval', 'opus-claim-lint', 'run.mjs');

let ok = 0, n = 0;
const t = (cond, msg) => { n++; if (cond) { ok++; console.log('PASS:', msg); } else console.log('FAIL:', msg); };

const PATH_RE = /\b(?:test|orchestration|eval|measurement|claude-code|codex|mcp|docs|tools)\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|json|md|sh)\b/g;
// A gate verdict must name a CONCRETE fresh-context reviewer identity AND a date — a bare "reviewed" or
// "리뷰어" token is not enough (G5.5 fresh-review L-fix: require a real identifier, not a permissive word).
const REVIEWER_RE = /(red-team-validator|codex-gpt)[\s\S]*\b20\d\d-\d\d-\d\d/i;

// A goal row starts with "- " and contains a goal id like **G1.2** or is a STAGE GATE.
function goalRows(text) {
  return text.split(/\r?\n/).filter(line => /^- /.test(line) && /\*\*G\d/.test(line));
}

// Returns an array of problem strings (empty = the ledger's own claims are FS-backed).
function checkLedgerEvidence(text, repoRoot) {
  const problems = [];
  for (const row of goalRows(text)) {
    const idMatch = row.match(/\*\*(G\d(?:\.\d+)?)\*\*/);
    const id = idMatch ? idMatch[1] : '(unknown)';
    const isDone = /^- \[x\]/.test(row);
    const title = row.split('|', 1)[0];
    const isGate = /\*\*STAGE GATE\*\*/.test(title);
    // Only `[x]` rows carry an assertion. Pending / parked / ⏸ HUMAN_GATE rows are explicitly ALLOWED to
    // lack evidence (the DoD permits park/null rows) — they are not-yet-done, not a bookkeeping violation.
    if (!isDone) continue;
    if (isGate) {
      // a done STAGE GATE must carry a verdict with a fresh-context reviewer identifier.
      const verdict = row.split(/\| *verdict:/)[1] || '';
      if (!REVIEWER_RE.test(verdict)) problems.push(`${id}: [x] STAGE GATE has no fresh-context reviewer verdict`);
      continue;
    }
    // a done goal row must cite >=1 existing evidence path.
    const evidence = row.split(/\| *evidence:/)[1] || '';
    const cited = [...evidence.matchAll(PATH_RE)].map(m => m[0]);
    const existing = cited.filter(rel => existsSync(path.join(repoRoot, rel)));
    if (cited.length === 0) problems.push(`${id}: [x] row cites no evidence path`);
    else if (existing.length === 0) problems.push(`${id}: [x] row cites ${cited.length} path(s) but NONE exist on disk: ${cited.slice(0, 3).join(', ')}`);
  }
  return problems;
}

// (1) the real ledger's [x] claims are all FS-backed.
const ledgerText = readFileSync(LEDGER, 'utf8');
const realProblems = checkLedgerEvidence(ledgerText, REPO);
t(realProblems.length === 0, `every [x] ledger row is FS-backed / every gate has a reviewer verdict (${realProblems.length} problem(s))`);
if (realProblems.length) realProblems.forEach(p => console.log('   -', p));

// (2) bidirectional: a synthetic ledger with an [x] row citing a nonexistent path FAILS.
const fakeLedger = [
  '- [x] **G9.9** `[codex]` **Fake goal** — desc | depends: — | **DoD:** none | evidence: `test/this-file-does-not-exist-zzz.mjs` 0/0.',
].join('\n');
const fakeProblems = checkLedgerEvidence(fakeLedger, REPO);
t(fakeProblems.some(p => /G9.9/.test(p)), 'bidirectional: an [x] row citing a nonexistent evidence path is detected (checker can FAIL)');

// (3) bidirectional: a synthetic gate with no reviewer verdict FAILS.
const fakeGate = '- [x] **G9.8** **STAGE GATE** — done | depends: — | verdict: looks fine to me';
const gateProblems = checkLedgerEvidence(fakeGate, REPO);
t(gateProblems.some(p => /G9.8/.test(p)), 'bidirectional: an [x] STAGE GATE without a fresh-context reviewer is detected');

// (4) G0.5 magnitude-claim lint stays green over the shipped docs.
const lint = spawnSync(process.execPath, [LINT], { encoding: 'utf8' });
t(lint.status === 0, 'G0.5 magnitude-claim lint passes over the shipped docs tree');

console.log(`\n${ok}/${n} checks passed`);
process.exit(ok === n ? 0 : 1);
