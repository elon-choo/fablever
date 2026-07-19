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
  a: { b: [10, 20] },
  'slash/key': 'decoded slash',
};

assert.equal(getPointer(value, ''), value, 'the empty pointer returns the input');
assert.equal(getPointer(value, '/a/b/0'), 10, 'array indexes are traversed');
assert.equal(getPointer(value, '/a/b/1'), 20);
assert.equal(
  getPointer(value, '/slash~1key'),
  'decoded slash',
  'escaped slash characters are decoded',
);

console.log('ok');
