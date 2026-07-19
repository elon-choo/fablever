// Comments (quote- and whitespace-aware) and duplicate-key arrays.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'ini-parse.mjs')).href;
const { parseIni } = await import(moduleUrl);

assert.equal(typeof parseIni, 'function', 'parseIni must be exported');

assert.deepEqual(
  parseIni('; leading comment\na = 1\n# another comment\nb = 2'),
  { a: 1, b: 2 },
  '";" and "#" start a whole-line comment',
);

assert.deepEqual(
  parseIni('    ; indented comment\n\t# indented too\na = 1'),
  { a: 1 },
  'a comment marker at the start of the TRIMMED line comments the whole line',
);

assert.deepEqual(
  parseIni('a = 1 ; trailing\nb = 2 # trailing\nc = 3\t; tab before marker'),
  { a: 1, b: 2, c: 3 },
  'a marker preceded by whitespace starts an inline comment',
);

assert.deepEqual(
  parseIni('a = x;y\nb = x#y\nc = 1;2\nd = a#b#c'),
  { a: 'x;y', b: 'x#y', c: '1;2', d: 'a#b#c' },
  'a marker not preceded by whitespace is ordinary text',
);

assert.deepEqual(
  parseIni('a = "x ; y"\nb = "x # y"'),
  { a: 'x ; y', b: 'x # y' },
  'a marker inside quotes is not a comment',
);

assert.deepEqual(
  parseIni('a = "x # y" ; real comment'),
  { a: 'x # y' },
  'a comment after a quoted value is still stripped',
);

assert.deepEqual(
  parseIni('a = "he said \\" ; not a comment"'),
  { a: 'he said " ; not a comment' },
  'an escaped quote does not end the quoted span for comment stripping',
);

assert.deepEqual(
  parseIni('[s] ; comment\na = 1\n[t]\t# comment\nb = 2'),
  { s: { a: 1 }, t: { b: 2 } },
  'a section header may carry a trailing comment',
);

assert.deepEqual(
  parseIni('a = 1\n   #   \n;\nb = 2'),
  { a: 1, b: 2 },
  'a line that is only a comment contributes nothing',
);

assert.deepEqual(
  parseIni('key ; = 1'),
  {},
  'a line whose "=" is inside a comment has no "=" left and is ignored',
);

assert.deepEqual(
  parseIni('[s]\nx = 1\nx = 2'),
  { s: { x: [1, 2] } },
  'a duplicate key becomes an array',
);

assert.deepEqual(
  parseIni('[s]\nx = 1\nx = two\nx = true\nx = "4"'),
  { s: { x: [1, 'two', true, '4'] } },
  'later duplicates append, in appearance order, keeping each value type',
);

assert.deepEqual(
  parseIni('x = a\nx = b'),
  { x: ['a', 'b'] },
  'duplicates work at the root too',
);

assert.deepEqual(
  parseIni('x = 1\n; comment\nx = 2'),
  { x: [1, 2] },
  'comment lines between duplicates do not break the array',
);

assert.deepEqual(
  parseIni('[s]\nx = 1\n[t]\nx = 2'),
  { s: { x: 1 }, t: { x: 2 } },
  'the same key in two different sections is not a duplicate',
);

assert.deepEqual(
  parseIni('x = 1\n[s]\nx = 2'),
  { x: 1, s: { x: 2 } },
  'a root key and a section key with the same name are not duplicates',
);

assert.deepEqual(
  parseIni('[a]\nx = 1\n[b]\nx = 2\n[a]\nx = 3'),
  { a: { x: [1, 3] }, b: { x: 2 } },
  'an assignment under a repeated header duplicates the earlier one in that section',
);

assert.deepEqual(
  parseIni('[a]\nx = 1\nx = 2\n[b]\ny = 9\n[a]\nx = 3'),
  { a: { x: [1, 2, 3] }, b: { y: 9 } },
  'a repeated header appends to the array the first block created',
);

assert.deepEqual(
  parseIni('[a.b]\nx = 1\n[a.b]\nx = 2'),
  { a: { b: { x: [1, 2] } } },
  'duplicates survive a repeated dotted header',
);

console.log('ok');
