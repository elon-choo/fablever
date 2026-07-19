import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'diff-hunks.mjs')).href;
const { diffHunks } = await import(moduleUrl);

assert.equal(typeof diffHunks, 'function', 'diffHunks must be exported');
assert.ok(Array.isArray(diffHunks(['a'], ['b'])), 'diffHunks must return an array');

// context = 1: a gap of exactly 2 unchanged lines is <= 2 * context, so it MERGES.
assert.deepEqual(
  diffHunks(['A', 'g1', 'g2', 'B'], ['A2', 'g1', 'g2', 'B2'], 1),
  ['@@ -1,4 +1,4 @@\n-A\n+A2\n g1\n g2\n-B\n+B2'],
  'with context 1 a gap of 2 unchanged lines must merge into ONE hunk',
);

// context = 1: a gap of 3 unchanged lines is > 2 * context, so it SPLITS.
assert.deepEqual(
  diffHunks(['A', 'g1', 'g2', 'g3', 'B'], ['A2', 'g1', 'g2', 'g3', 'B2'], 1),
  ['@@ -1,2 +1,2 @@\n-A\n+A2\n g1', '@@ -4,2 +4,2 @@\n g3\n-B\n+B2'],
  'with context 1 a gap of 3 unchanged lines must split into two hunks, dropping the middle line',
);

// Default context = 3: a gap of exactly 6 unchanged lines MERGES.
assert.deepEqual(
  diffHunks(
    ['c0', 'X', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'Y', 'c7'],
    ['c0', 'X2', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'Y2', 'c7'],
  ),
  ['@@ -1,10 +1,10 @@\n c0\n-X\n+X2\n c1\n c2\n c3\n c4\n c5\n c6\n-Y\n+Y2\n c7'],
  'with the default context 3 a gap of 6 unchanged lines must merge into ONE hunk',
);

// Default context = 3: a gap of 7 unchanged lines SPLITS.
assert.deepEqual(
  diffHunks(
    ['c0', 'X', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'Y', 'c8'],
    ['c0', 'X2', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'Y2', 'c8'],
  ),
  [
    '@@ -1,5 +1,5 @@\n c0\n-X\n+X2\n c1\n c2\n c3',
    '@@ -7,5 +7,5 @@\n c5\n c6\n c7\n-Y\n+Y2\n c8',
  ],
  'with the default context 3 a gap of 7 unchanged lines must split into two hunks',
);

// context = 0: a gap of 0 merges, a gap of 1 splits.
assert.deepEqual(
  diffHunks(['a', 'M', 'N', 'c'], ['a', 'M2', 'N2', 'c'], 0),
  ['@@ -2,2 +2,2 @@\n-M\n-N\n+M2\n+N2'],
  'with context 0 touching changes must still form ONE hunk',
);
assert.deepEqual(
  diffHunks(['a', 'M', 'b', 'N', 'c'], ['a', 'M2', 'b', 'N2', 'c'], 0),
  ['@@ -2,1 +2,1 @@\n-M\n+M2', '@@ -4,1 +4,1 @@\n-N\n+N2'],
  'with context 0 a gap of 1 unchanged line must split into two hunks',
);

// Three changes, context = 1: the first two merge, the third splits away.
assert.deepEqual(
  diffHunks(
    ['A', 'g1', 'g2', 'B', 'h1', 'h2', 'h3', 'C'],
    ['A2', 'g1', 'g2', 'B2', 'h1', 'h2', 'h3', 'C2'],
    1,
  ),
  [
    '@@ -1,5 +1,5 @@\n-A\n+A2\n g1\n g2\n-B\n+B2\n h1',
    '@@ -7,2 +7,2 @@\n h3\n-C\n+C2',
  ],
  'merging must chain: gap 2 merges into the running group, then gap 3 starts a new hunk',
);

// The same input at a larger context collapses to a single hunk.
assert.deepEqual(
  diffHunks(
    ['A', 'g1', 'g2', 'B', 'h1', 'h2', 'h3', 'C'],
    ['A2', 'g1', 'g2', 'B2', 'h1', 'h2', 'h3', 'C2'],
    2,
  ),
  ['@@ -1,8 +1,8 @@\n-A\n+A2\n g1\n g2\n-B\n+B2\n h1\n h2\n h3\n-C\n+C2'],
  'with context 2 every gap is <= 4, so all three changes must merge into ONE hunk',
);

// Widening the context must never increase the number of hunks.
const a = ['a', 'X', 'b', 'c', 'd', 'e', 'f', 'g', 'Y', 'h', 'i', 'j', 'k', 'l', 'Z', 'm'];
const b = ['a', 'X2', 'b', 'c', 'd', 'e', 'f', 'g', 'Y2', 'h', 'i', 'j', 'k', 'l', 'Z2', 'm'];
let previous = Infinity;
for (const context of [0, 1, 2, 3, 4, 5, 6]) {
  const count = diffHunks(a, b, context).length;
  assert.ok(count >= 1, `context ${context} must still report the changes`);
  assert.ok(
    count <= previous,
    `widening context to ${context} must not increase the hunk count (${previous} -> ${count})`,
  );
  previous = count;
}
assert.equal(previous, 1, 'a context of 6 must merge every change into one hunk');

console.log('ok');
