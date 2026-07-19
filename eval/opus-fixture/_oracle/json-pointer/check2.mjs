import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
assert.ok(solutionDir, 'solution directory argument is required');

const moduleUrl = pathToFileURL(
  path.join(path.resolve(solutionDir), 'json-pointer.mjs'),
).href;
const { getPointer } = await import(moduleUrl);
assert.equal(typeof getPointer, 'function');

const value = {
  'a/b': { 'm~n': 42 },
  '~1': 'literal tilde-one',
  '/': 'wrong-order sentinel',
};

assert.equal(getPointer(value, '/a~1b/m~0n'), 42);
assert.equal(
  getPointer(value, '/~01'),
  'literal tilde-one',
  'escape replacements are applied in the required order',
);
assert.equal(
  getPointer(value, '/a~1b/missing/value'),
  undefined,
  'a missing intermediate segment returns undefined',
);

console.log('ok');
