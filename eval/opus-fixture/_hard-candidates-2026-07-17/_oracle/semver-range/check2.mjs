// Surface: hyphen ranges (bound inclusivity, partial endpoints, zero-fill), the
// tokenizer that must not confuse a prerelease dash with a hyphen range, whitespace
// handling, the empty range, and hyphen ranges composed with AND/OR.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'semver-range.mjs')).href;
const { satisfies } = await import(moduleUrl);

assert.equal(typeof satisfies, 'function', 'satisfies must be exported');

const cases = [
  // complete endpoints: both bounds inclusive
  ['1.2.3', '1.2.3 - 2.3.4', true, 'a hyphen range includes its lower bound'],
  ['2.3.4', '1.2.3 - 2.3.4', true, 'a complete upper endpoint is inclusive'],
  ['1.9.9', '1.2.3 - 2.3.4', true, 'a hyphen range includes the interior'],
  ['1.2.2', '1.2.3 - 2.3.4', false, 'a hyphen range excludes below its lower bound'],
  ['2.3.5', '1.2.3 - 2.3.4', false, 'a hyphen range excludes above a complete upper bound'],
  ['3.0.0', '1.2.3 - 2.3.4', false, 'a hyphen range excludes a later major'],
  ['1.0.0', '1.0.0 - 1.0.0', true, 'a degenerate hyphen range matches its single version'],
  ['1.0.1', '1.0.0 - 1.0.0', false, 'a degenerate hyphen range matches nothing else'],

  // two-part upper endpoint: < next minor
  ['1.2.3', '1.2.3 - 1.2', true, 'a 1.2 upper endpoint includes 1.2.3'],
  ['1.2.9', '1.2.3 - 1.2', true, 'a 1.2 upper endpoint spans the rest of the minor'],
  ['1.2.99', '1.2.3 - 1.2', true, 'a 1.2 upper endpoint has no patch ceiling inside 1.2'],
  ['1.3.0', '1.2.3 - 1.2', false, 'a 1.2 upper endpoint stops below 1.3.0'],
  ['2.3.9', '1.2.3 - 2.3', true, 'a 2.3 upper endpoint spans the rest of that minor'],
  ['2.4.0', '1.2.3 - 2.3', false, 'a 2.3 upper endpoint stops below 2.4.0'],

  // one-part upper endpoint: < next major
  ['2.0.0', '1.2.3 - 2', true, 'a 2 upper endpoint includes 2.0.0'],
  ['2.9.9', '1.2.3 - 2', true, 'a 2 upper endpoint spans the whole major'],
  ['3.0.0', '1.2.3 - 2', false, 'a 2 upper endpoint stops below 3.0.0'],
  ['0.9.9', '0 - 0', true, 'a 0 upper endpoint spans the zero major'],
  ['1.0.0', '0 - 0', false, 'a 0 upper endpoint stops below 1.0.0'],

  // partial lower endpoint: zero-filled, inclusive
  ['1.2.0', '1.2 - 2.3.4', true, 'a 1.2 lower endpoint zero-fills to 1.2.0'],
  ['1.1.9', '1.2 - 2.3.4', false, 'a 1.2 lower endpoint excludes 1.1.9'],
  ['1.0.0', '1 - 2.3.4', true, 'a 1 lower endpoint zero-fills to 1.0.0'],
  ['0.9.9', '1 - 2.3.4', false, 'a 1 lower endpoint excludes 0.9.9'],
  ['0.0.0', '0 - 1', true, 'a 0 lower endpoint zero-fills to 0.0.0'],

  // both endpoints partial
  ['1.2.0', '1.2 - 2.3', true, 'both endpoints may be partial'],
  ['2.3.9', '1.2 - 2.3', true, 'a partial upper endpoint still spans its minor'],
  ['2.4.0', '1.2 - 2.3', false, 'a partial upper endpoint still stops at the next minor'],
  ['1.1.9', '1.2 - 2.3', false, 'a partial lower endpoint still excludes below itself'],

  // the dash inside a prerelease is not a hyphen range
  ['1.2.3-rc.1', '1.2.3-rc.1', true, 'a prerelease term is one token, not a hyphen range'],
  ['1.2.4', '1.2.3-rc.1', false, 'a prerelease term is still an exact term'],
  ['1.2.3', '>=1.2.3-rc.1 <2.0.0', true, 'a dash inside a comparator is a prerelease'],

  // prereleases on hyphen endpoints
  ['1.2.3-beta', '1.2.3-alpha - 1.2.3-rc', true, 'hyphen endpoints may carry prereleases'],
  ['1.2.3-alpha', '1.2.3-alpha - 1.2.3-rc', true, 'a prerelease lower endpoint is inclusive'],
  ['1.2.3-rc', '1.2.3-alpha - 1.2.3-rc', true, 'a complete prerelease upper endpoint is inclusive'],
  ['1.2.3-rc.1', '1.2.3-alpha - 1.2.3-rc', false, 'rc.1 is above the rc upper endpoint'],
  ['1.2.3-alpha.1', '1.2.3-beta - 1.2.3-rc', false, 'alpha.1 is below the beta lower endpoint'],
  ['1.5.0', '1.2.3-rc.1 - 2.0.0', true, 'a release inside a prerelease-anchored hyphen range matches'],

  // hyphen ranges composed with other terms
  ['1.5.0', '1.2.3 - 2.3.4 <2.0.0', true, 'a hyphen range ANDs with a following comparator'],
  ['2.1.0', '1.2.3 - 2.3.4 <2.0.0', false, 'the following comparator narrows the hyphen range'],
  ['1.5.0', '>=1.0.0 1.2.3 - 2.3.4', true, 'a hyphen range ANDs with a preceding comparator'],
  ['1.2.4', '>=1.5.0 1.2.3 - 2.3.4', false, 'the preceding comparator narrows the hyphen range'],
  ['1.5.0', '1.2.3 - 2.3.4 || 8.0.0 - 9.0.0', true, 'a hyphen range works in the first OR group'],
  ['8.5.0', '1.2.3 - 2.3.4 || 8.0.0 - 9.0.0', true, 'a hyphen range works in the second OR group'],
  ['5.0.0', '1.2.3 - 2.3.4 || 8.0.0 - 9.0.0', false, 'ORed hyphen ranges reject the gap between them'],
  ['2.0.0', '1.2.3 - 1.9.9 || ^2.0.0', true, 'a hyphen range ORs with a caret'],

  // whitespace handling
  ['1.5.0', '  1.2.3   -   2.3.4  ', true, 'extra whitespace around a hyphen range is ignored'],
  ['1.3.0', '  >=1.2.0    <1.4.0  ', true, 'extra whitespace between comparators is ignored'],
  ['2.5.0', '^1.2.3   ||   ^2.0.0', true, 'extra whitespace around || is ignored'],
  ['1.3.0', '\t>=1.2.0\n<1.4.0\t', true, 'tabs and newlines separate comparators like spaces'],

  // the empty range behaves like *
  ['4.5.6', '', true, 'an empty range behaves like *'],
  ['0.0.0', '   ', true, 'a whitespace-only range behaves like *'],
  ['4.5.6', '1.2.3 || ', true, 'an empty OR group behaves like *'],
];

for (const [version, range, expected, why] of cases) {
  assert.equal(
    satisfies(version, range),
    expected,
    `${why}: satisfies(${JSON.stringify(version)}, ${JSON.stringify(range)}) must be ${expected}`,
  );
}

console.log('ok');
