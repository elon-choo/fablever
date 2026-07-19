// Surface: explicit comparators, caret tiers, tilde tiers, partial/wildcard terms,
// and AND/OR composition. No prereleases here (check3 owns those).
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'semver-range.mjs')).href;
const { satisfies } = await import(moduleUrl);

assert.equal(typeof satisfies, 'function', 'satisfies must be exported');

const cases = [
  // exact terms
  ['1.2.3', '1.2.3', true, 'an exact term matches its own version'],
  ['1.2.4', '1.2.3', false, 'an exact term rejects a different patch'],
  ['1.3.3', '1.2.3', false, 'an exact term rejects a different minor'],

  // explicit comparators
  ['1.2.3', '>=1.2.3', true, '>= is inclusive at its bound'],
  ['1.2.2', '>=1.2.3', false, '>= rejects below its bound'],
  ['1.2.3', '<=1.2.3', true, '<= is inclusive at its bound'],
  ['1.2.4', '<=1.2.3', false, '<= rejects above its bound'],
  ['1.2.3', '>1.2.3', false, '> is exclusive at its bound'],
  ['1.2.4', '>1.2.3', true, '> accepts above its bound'],
  ['1.2.3', '<1.2.3', false, '< is exclusive at its bound'],
  ['1.2.2', '<1.2.3', true, '< accepts below its bound'],
  ['1.2.3', '=1.2.3', true, '= matches its own version'],
  ['1.2.4', '=1.2.3', false, '= rejects a different version'],
  ['2.0.0', '>1.9.9', true, 'comparators order major before minor'],
  ['1.10.0', '>1.9.0', true, 'minor parts compare numerically, not as strings'],
  ['1.0.10', '>1.0.9', true, 'patch parts compare numerically, not as strings'],

  // caret: major > 0
  ['1.2.3', '^1.2.3', true, '^1.2.3 is inclusive at 1.2.3'],
  ['1.2.2', '^1.2.3', false, '^1.2.3 excludes 1.2.2'],
  ['1.2.9', '^1.2.3', true, '^1.2.3 allows patch drift'],
  ['1.9.0', '^1.2.3', true, '^1.2.3 allows minor drift'],
  ['1.99.99', '^1.2.3', true, '^1.2.3 spans the whole major'],
  ['2.0.0', '^1.2.3', false, '^1.2.3 stops below 2.0.0'],
  ['0.9.9', '^1.2.3', false, '^1.2.3 excludes an earlier major'],

  // caret: 0.x.y
  ['0.2.3', '^0.2.3', true, '^0.2.3 is inclusive at 0.2.3'],
  ['0.2.9', '^0.2.3', true, '^0.2.3 allows patch drift'],
  ['0.2.2', '^0.2.3', false, '^0.2.3 excludes 0.2.2'],
  ['0.3.0', '^0.2.3', false, '^0.2.3 stops below 0.3.0'],

  // caret: 0.0.x
  ['0.0.3', '^0.0.3', true, '^0.0.3 is inclusive at 0.0.3'],
  ['0.0.4', '^0.0.3', false, '^0.0.3 stops below 0.0.4'],
  ['0.0.2', '^0.0.3', false, '^0.0.3 excludes 0.0.2'],
  ['0.1.0', '^0.0.3', false, '^0.0.3 excludes 0.1.0'],
  ['0.0.0', '^0.0.0', true, '^0.0.0 is inclusive at 0.0.0'],
  ['0.0.1', '^0.0.0', false, '^0.0.0 stops below 0.0.1'],

  // tilde: three parts
  ['1.2.3', '~1.2.3', true, '~1.2.3 is inclusive at 1.2.3'],
  ['1.2.2', '~1.2.3', false, '~1.2.3 excludes 1.2.2'],
  ['1.2.9', '~1.2.3', true, '~1.2.3 allows patch drift'],
  ['1.3.0', '~1.2.3', false, '~1.2.3 stops below 1.3.0'],
  ['1.2.99', '~1.2.3', true, '~1.2.3 spans the rest of the minor'],

  // tilde on a zero major: same rule, no caret-style tiering
  ['0.2.9', '~0.2.3', true, '~0.2.3 allows patch drift'],
  ['0.3.0', '~0.2.3', false, '~0.2.3 stops below 0.3.0'],
  ['0.0.9', '~0.0.3', true, '~0.0.3 allows patch drift up to <0.1.0'],
  ['0.0.4', '~0.0.3', true, '~0.0.3 does not stop at 0.0.4'],
  ['0.0.2', '~0.0.3', false, '~0.0.3 excludes 0.0.2'],
  ['0.1.0', '~0.0.3', false, '~0.0.3 stops below 0.1.0'],
  ['0.0.99', '~0.0.0', true, '~0.0.0 spans the whole 0.0 minor'],
  ['0.1.0', '~0.0.0', false, '~0.0.0 stops below 0.1.0'],

  // tilde: two parts and one part
  ['1.2.0', '~1.2', true, '~1.2 zero-fills its lower bound'],
  ['1.2.9', '~1.2', true, '~1.2 allows patch drift'],
  ['1.1.9', '~1.2', false, '~1.2 excludes an earlier minor'],
  ['1.3.0', '~1.2', false, '~1.2 stops below 1.3.0'],
  ['1.0.0', '~1', true, '~1 zero-fills its lower bound'],
  ['1.9.9', '~1', true, '~1 spans the whole major'],
  ['2.0.0', '~1', false, '~1 stops below 2.0.0'],
  ['0.9.9', '~0', true, '~0 spans the whole zero major'],
  ['1.0.0', '~0', false, '~0 stops below 1.0.0'],

  // wildcards and bare partials
  ['0.0.0', '*', true, '* accepts the lowest version'],
  ['4.5.6', '*', true, '* accepts any release'],
  ['4.5.6', 'x', true, 'a bare x behaves like *'],
  ['4.5.6', 'X', true, 'a bare X behaves like *'],
  ['1.0.0', '1.x', true, '1.x is inclusive at 1.0.0'],
  ['1.9.9', '1.x', true, '1.x spans the whole major'],
  ['1.9.9', '1.X', true, '1.X spans the whole major'],
  ['1.9.9', '1.*', true, '1.* spans the whole major'],
  ['1.9.9', '1', true, 'a bare 1 behaves like 1.x'],
  ['2.0.0', '1.x', false, '1.x stops below 2.0.0'],
  ['0.9.9', '1.x', false, '1.x excludes an earlier major'],
  ['1.2.0', '1.2.x', true, '1.2.x is inclusive at 1.2.0'],
  ['1.2.9', '1.2.x', true, '1.2.x spans the whole minor'],
  ['1.2.9', '1.2.X', true, '1.2.X spans the whole minor'],
  ['1.2.9', '1.2', true, 'a bare 1.2 behaves like 1.2.x'],
  ['1.3.0', '1.2.x', false, '1.2.x stops below 1.3.0'],
  ['1.1.9', '1.2.x', false, '1.2.x excludes an earlier minor'],
  ['0.9.9', '0.x', true, '0.x spans the zero major'],
  ['1.0.0', '0.x', false, '0.x stops below 1.0.0'],

  // AND groups
  ['1.3.0', '>=1.2.0 <1.4.0', true, 'space-separated comparators are ANDed'],
  ['1.5.0', '>=1.2.0 <1.4.0', false, 'an AND group rejects when one comparator fails'],
  ['1.1.0', '>=1.2.0 <1.4.0', false, 'an AND group rejects when the lower bound fails'],
  ['1.2.5', '^1.2.3 <1.2.9', true, 'a caret can be narrowed by another comparator'],
  ['1.2.9', '^1.2.3 <1.2.9', false, 'the narrowing comparator still applies'],
  ['1.2.5', '1.x >=1.2.0 <1.3.0', true, 'three ANDed terms all apply'],
  ['1.5.0', '1.x >=1.2.0 <1.3.0', false, 'a wildcard term does not widen its AND group'],

  // OR groups
  ['2.5.0', '^1.2.3 || ^2.0.0', true, '|| accepts when the second group matches'],
  ['1.5.0', '^1.2.3 || ^2.0.0', true, '|| accepts when the first group matches'],
  ['3.0.0', '^1.2.3 || ^2.0.0', false, '|| rejects when no group matches'],
  ['1.2.3', '1.2.3 || 4.5.6', true, '|| works with exact terms'],
  ['4.5.6', '1.2.3 || 4.5.6', true, '|| works with exact terms'],
  ['7.8.9', '1.2.3 || 4.5.6', false, '|| rejects an unlisted exact version'],
  ['2.5.0', '<1.0.0 || >=2.0.0 <3.0.0 || >=9.0.0', true, 'three OR groups are all considered'],
  ['9.1.0', '<1.0.0 || >=2.0.0 <3.0.0 || >=9.0.0', true, 'the last OR group is considered'],
  ['5.0.0', '<1.0.0 || >=2.0.0 <3.0.0 || >=9.0.0', false, 'a version in no OR group is rejected'],
];

for (const [version, range, expected, why] of cases) {
  assert.equal(
    satisfies(version, range),
    expected,
    `${why}: satisfies(${JSON.stringify(version)}, ${JSON.stringify(range)}) must be ${expected}`,
  );
}

console.log('ok');
