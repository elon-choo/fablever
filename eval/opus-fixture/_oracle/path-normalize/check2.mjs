import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'path-normalize.mjs')).href;
const { normalizePath } = await import(moduleUrl);

assert.equal(typeof normalizePath, 'function', 'normalizePath must be exported');
assert.equal(normalizePath('/a/b/../c'), '/a/c', 'a parent segment must remove the preceding segment');
assert.equal(normalizePath('/a/../../b'), '/b', 'parent traversal beyond root must clamp at root');
assert.equal(normalizePath('/..'), '/', 'a parent segment at root must remain at root');

console.log('ok');
