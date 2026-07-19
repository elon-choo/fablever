import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'diff-hunks.mjs')).href;
const { diffHunks } = await import(moduleUrl);

assert.equal(typeof diffHunks, 'function', 'diffHunks must be exported');

// Zero-count rule: a side with no lines starts at the line BEFORE the change.
assert.deepEqual(
  diffHunks([], ['hello']),
  ['@@ -0,0 +1,1 @@\n+hello'],
  'inserting into an empty a must give aStart 0 and aCount 0',
);
assert.deepEqual(
  diffHunks(['x'], []),
  ['@@ -1,1 +0,0 @@\n-x'],
  'emptying a into b must give bStart 0 and bCount 0',
);
assert.deepEqual(
  diffHunks(['a', 'b'], ['a', 'x', 'b'], 0),
  ['@@ -1,0 +2,1 @@\n+x'],
  'with context 0 an insertion after a line 1 must give aStart 1 (the line before), aCount 0',
);
assert.deepEqual(
  diffHunks(['a', 'b', 'c'], ['a', 'c'], 0),
  ['@@ -2,1 +1,0 @@\n-b'],
  'with context 0 a deletion must give bStart 1 (the line before), bCount 0',
);

// Counts of 1 are still written with an explicit ",1".
assert.deepEqual(
  diffHunks(['a'], ['b'], 0),
  ['@@ -1,1 +1,1 @@\n-a\n+b'],
  'a count of 1 must still be written as ",1", never abbreviated',
);

// Context is clamped at the start and the end of the files.
assert.deepEqual(
  diffHunks(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ),
  ['@@ -5,3 +5,4 @@\n e\n f\n g\n+h'],
  'appending must take 3 leading context lines and clamp at the end of the file',
);
assert.deepEqual(
  diffHunks(['a', 'b', 'c', 'd', 'e'], ['z', 'a', 'b', 'c', 'd', 'e']),
  ['@@ -1,3 +1,4 @@\n+z\n a\n b\n c'],
  'prepending must clamp the leading context at the start of the file',
);

// Once the sides drift apart, aStart and bStart must be tracked independently.
assert.deepEqual(
  diffHunks(['1', '2', '3', '4', '5'], ['1', '3', '5'], 0),
  ['@@ -2,1 +1,0 @@\n-2', '@@ -4,1 +2,0 @@\n-4'],
  'the b-side start must reflect the lines already deleted from a',
);

// A later hunk on a long file must carry the right offsets on both sides.
assert.deepEqual(
  diffHunks(
    ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'],
    ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8x'],
    1,
  ),
  ['@@ -7,2 +7,2 @@\n L7\n-L8\n+L8x'],
  'a hunk late in the file must start at the right line on both sides',
);

// Every emitted header must have the exact documented shape.
const headerShape = /^@@ -\d+,\d+ \+\d+,\d+ @@$/;
const sample = diffHunks(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'J'],
  1,
);
assert.ok(sample.length > 0, 'the sample input must produce at least one hunk');
for (const hunk of sample) {
  const header = hunk.split('\n')[0];
  assert.ok(
    headerShape.test(header),
    `header ${JSON.stringify(header)} must match "@@ -aStart,aCount +bStart,bCount @@"`,
  );
}

// The body line counts must agree with the header's counts.
for (const hunk of sample) {
  const lines = hunk.split('\n');
  const [, aCount, bCount] = lines[0].match(/^@@ -\d+,(\d+) \+\d+,(\d+) @@$/).map(Number);
  const body = lines.slice(1);
  const aLines = body.filter((line) => line[0] === ' ' || line[0] === '-').length;
  const bLines = body.filter((line) => line[0] === ' ' || line[0] === '+').length;
  assert.equal(aLines, aCount, `aCount must equal the number of " " and "-" lines in ${JSON.stringify(hunk)}`);
  assert.equal(bLines, bCount, `bCount must equal the number of " " and "+" lines in ${JSON.stringify(hunk)}`);
}

console.log('ok');
