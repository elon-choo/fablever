import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'csv-parse.mjs')).href;
const { parseCsv } = await import(moduleUrl);

assert.equal(typeof parseCsv, 'function', 'parseCsv must be exported');
assert.deepEqual(
  parseCsv('"she said ""hi"""'),
  [['she said "hi"']],
  'doubled quotes inside a quoted field must decode to one quote',
);
assert.deepEqual(
  parseCsv('x,y\n'),
  [['x', 'y']],
  'a trailing newline must not create an empty final row',
);

console.log('ok');
