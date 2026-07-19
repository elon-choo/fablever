import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'diff-hunks.mjs')).href;
const { diffHunks } = await import(moduleUrl);

assert.equal(typeof diffHunks, 'function', 'diffHunks must be exported');

// A single replaced line, default context of 3.
assert.deepEqual(
  diffHunks(
    ['one', 'two', 'three', 'four', 'five'],
    ['one', 'two', 'THREE', 'four', 'five'],
  ),
  ['@@ -1,5 +1,5 @@\n one\n two\n-three\n+THREE\n four\n five'],
  'a one-line replacement must produce one hunk with surrounding context',
);

// Identical inputs produce no hunks.
assert.deepEqual(
  diffHunks(['a', 'b'], ['a', 'b']),
  [],
  'identical inputs must return an empty array',
);
assert.deepEqual(
  diffHunks([], []),
  [],
  'two empty inputs are identical and must return an empty array',
);

// LCS tie-break: matches must land as early as possible.
assert.deepEqual(
  diffHunks(['A', 'B', 'A'], ['A']),
  ['@@ -1,3 +1,1 @@\n A\n-B\n-A'],
  'the earliest possible match must win: the FIRST A is the matched line',
);
assert.deepEqual(
  diffHunks(['A'], ['A', 'B', 'A']),
  ['@@ -1,1 +1,3 @@\n A\n+B\n+A'],
  'the earliest possible match must win on the insertion side too',
);

// Within one change run, deletions come before insertions.
assert.deepEqual(
  diffHunks(['A', 'B'], ['C', 'D']),
  ['@@ -1,2 +1,2 @@\n-A\n-B\n+C\n+D'],
  'a wholly replaced run must emit every - line before every + line',
);
assert.deepEqual(
  diffHunks(['p', 'q', 'M', 'N', 'r', 's'], ['p', 'q', 'M2', 'N2', 'r', 's'], 2),
  ['@@ -1,6 +1,6 @@\n p\n q\n-M\n-N\n+M2\n+N2\n r\n s'],
  'two adjacent replaced lines must emit -M -N then +M2 +N2, not interleaved',
);

// The LCS must actually find the common subsequence, not just compare positionally.
assert.deepEqual(
  diffHunks(['A', 'x', 'B', 'y', 'C'], ['A', 'B', 'C'], 1),
  ['@@ -1,5 +1,3 @@\n A\n-x\n B\n-y\n C'],
  'A, B and C must be recognised as common lines',
);

// A run with unequal numbers of deletions and insertions.
assert.deepEqual(
  diffHunks(
    ['k1', 'k2', 'old1', 'old2', 'k3', 'k4'],
    ['k1', 'k2', 'new1', 'new2', 'new3', 'k3', 'k4'],
    2,
  ),
  ['@@ -1,6 +1,7 @@\n k1\n k2\n-old1\n-old2\n+new1\n+new2\n+new3\n k3\n k4'],
  'a run replacing 2 lines with 3 must count each side independently',
);

// A hunk is one string, not an array of lines.
const [hunk] = diffHunks(['a'], ['b'], 0);
assert.equal(typeof hunk, 'string', 'each hunk must be a single string');
assert.ok(!hunk.endsWith('\n'), 'a hunk string must not end with a trailing newline');

console.log('ok');
