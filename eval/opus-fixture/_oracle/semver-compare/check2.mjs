import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'semver-compare.mjs')).href;
const { compareSemver } = await import(moduleUrl);

assert.equal(typeof compareSemver, 'function', 'compareSemver must be exported');
assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1, 'a pre-release must precede the normal version');
assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1, 'text identifiers must compare in order');
assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2'), -1, 'numeric identifiers must compare numerically');
// Discriminating case: numeric identifiers compare NUMERICALLY, not lexically — 2 < 11. A wrong impl that
// string-compares the pre-release ('2' > '1') gets this backwards. Closes the numeric-main + lexical-prerelease
// false-accept the fixture reviewer demonstrated (alpha.1 vs alpha.2 alone also passes under lexical order).
assert.equal(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.11'), -1, 'numeric identifiers 2 < 11 (numeric, not lexical)');
assert.equal(compareSemver('1.0.0-alpha.11', '1.0.0-alpha.2'), 1, 'numeric identifiers 11 > 2 (numeric, not lexical)');

console.log('ok');
