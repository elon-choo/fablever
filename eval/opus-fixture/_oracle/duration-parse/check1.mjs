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

assert.equal(parseDuration('500ms'), 500);
assert.equal(parseDuration('2s'), 2_000);
assert.equal(parseDuration('3m'), 180_000);
assert.equal(parseDuration('1h'), 3_600_000);
assert.equal(parseDuration('1d'), 86_400_000);
assert.equal(parseDuration('1h30m'), 5_400_000, 'compound components are summed');
assert.equal(parseDuration('2m30s'), 150_000, 'each compound unit contributes');

console.log('ok');
