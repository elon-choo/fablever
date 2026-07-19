import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'semver-compare.mjs')).href;
const { compareSemver } = await import(moduleUrl);

assert.equal(typeof compareSemver, 'function', 'compareSemver must be exported');
assert.equal(compareSemver('1.10.0', '1.9.0'), 1, 'minor components must compare numerically');
assert.equal(compareSemver('2.0.0', '10.0.0'), -1, 'major components must compare numerically');
assert.equal(compareSemver('3.4.5', '3.4.5'), 0, 'equal versions must compare as equal');

console.log('ok');
