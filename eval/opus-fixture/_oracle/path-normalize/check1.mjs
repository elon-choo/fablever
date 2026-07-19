import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'path-normalize.mjs')).href;
const { normalizePath } = await import(moduleUrl);

assert.equal(typeof normalizePath, 'function', 'normalizePath must be exported');
assert.equal(normalizePath('/a//b/./'), '/a/b', 'duplicate slashes, dot segments, and a trailing slash must collapse');
assert.equal(normalizePath('////'), '/', 'a path containing only slashes must normalize to root');
assert.equal(normalizePath('/../a//b/./'), '/a/b', 'normalization must remain rooted before processing ordinary segments');

console.log('ok');
