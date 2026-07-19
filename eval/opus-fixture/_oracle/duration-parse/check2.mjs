import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
assert.ok(solutionDir, 'solution directory argument is required');

const moduleUrl = pathToFileURL(
  path.join(path.resolve(solutionDir), 'duration-parse.mjs'),
).href;
const { parseDuration } = await import(moduleUrl);
assert.equal(typeof parseDuration, 'function');

assert.equal(parseDuration('1.5h'), 5_400_000);
assert.equal(parseDuration('0.5s'), 500);
assert.equal(
  parseDuration('  1h 30m  '),
  5_400_000,
  'whitespace between compound components is accepted',
);
assert.equal(parseDuration('\t0.5s\n'), 500);

for (const invalid of ['', 'abc', '10x', 'h']) {
  assert.equal(parseDuration(invalid), null, `${JSON.stringify(invalid)} is invalid`);
}

console.log('ok');
