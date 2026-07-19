import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'csv-parse.mjs')).href;
const { parseCsv } = await import(moduleUrl);

assert.equal(typeof parseCsv, 'function', 'parseCsv must be exported');
assert.deepEqual(
  parseCsv('name,age\nAda,36'),
  [['name', 'age'], ['Ada', '36']],
  'ordinary rows and fields must be parsed',
);
assert.deepEqual(
  parseCsv('a,"b,c",d'),
  [['a', 'b,c', 'd']],
  'a comma inside a quoted field must remain in that field',
);

console.log('ok');
