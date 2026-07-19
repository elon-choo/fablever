// Surface: prerelease ordering (numeric vs alphanumeric identifiers, length tiebreak,
// release outranks prerelease) and the prerelease admission rule from section 4 —
// same-tuple + has-prerelease, scoped to the matching AND-group.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'semver-range.mjs')).href;
const { satisfies } = await import(moduleUrl);

assert.equal(typeof satisfies, 'function', 'satisfies must be exported');

const cases = [
  // the standard ordering ladder, walked one rung at a time
  ['1.0.0-alpha.1', '>1.0.0-alpha', true, 'alpha.1 outranks alpha (shorter list is lower)'],
  ['1.0.0-alpha', '>1.0.0-alpha.1', false, 'alpha does not outrank alpha.1'],
  ['1.0.0-alpha.beta', '>1.0.0-alpha.1', true, 'alpha.beta outranks alpha.1 (numeric below alphanumeric)'],
  ['1.0.0-alpha.1', '>1.0.0-alpha.beta', false, 'alpha.1 does not outrank alpha.beta'],
  ['1.0.0-beta', '>1.0.0-alpha.beta', true, 'beta outranks alpha.beta'],
  ['1.0.0-beta.2', '>1.0.0-beta', true, 'beta.2 outranks beta'],
  ['1.0.0-beta.11', '>1.0.0-beta.2', true, 'beta.11 outranks beta.2 (numeric identifiers compare numerically)'],
  ['1.0.0-beta.2', '>1.0.0-beta.11', false, 'beta.2 does not outrank beta.11'],
  ['1.0.0-rc.1', '>1.0.0-beta.11', true, 'rc.1 outranks beta.11'],
  ['1.0.0', '>1.0.0-rc.1', true, 'a release outranks its own prerelease'],
  ['1.0.0-rc.1', '>1.0.0', false, 'a prerelease does not outrank its release'],
  ['1.0.0-rc.1', '>=1.0.0-rc.1 <1.0.0', true, 'a prerelease sits below its own release'],
  ['1.0.0-beta.11', '>=1.0.0-beta.2 <1.0.0-rc.1', true, 'a prerelease window admits beta.11'],
  ['1.0.0-beta.2', '>1.0.0-beta.11 <1.0.0-rc.1', false, 'a prerelease window rejects beta.2 below it'],
  ['1.0.0-beta.99', '>=1.0.0-beta.100', false, 'beta.99 is below beta.100 numerically'],
  ['1.0.0-beta.100', '>=1.0.0-beta.99', true, 'beta.100 is above beta.99 numerically'],

  // numeric identifiers sort below alphanumeric ones
  ['1.0.0-1', '<1.0.0-alpha', true, 'a numeric identifier is below an alphanumeric one'],
  ['1.0.0-alpha', '<1.0.0-1', false, 'an alphanumeric identifier is not below a numeric one'],
  ['1.0.0-2', '>1.0.0-1', true, 'bare numeric prereleases compare numerically'],
  ['1.0.0-10', '>1.0.0-9', true, 'bare numeric prereleases are not compared as strings'],

  // identifiers may contain a dash; only the first dash starts the prerelease
  ['1.2.3-alpha-1', '=1.2.3-alpha-1', true, 'a dash inside an identifier is part of that identifier'],
  ['1.2.3-alpha-1', '=1.2.3-alpha', false, 'alpha-1 is a different identifier from alpha'],
  ['1.2.3-alpha-1', '>1.2.3-alpha', true, 'alpha-1 sorts above alpha by ASCII order'],
  ['1.2.3-rc.1.2', '>1.2.3-rc.1', true, 'a longer identifier list outranks its own prefix'],
  ['1.2.3-rc.1', '>1.2.3-rc.1.2', false, 'a prefix does not outrank the longer list'],

  // section 4 rule 2: a prerelease needs a same-tuple prerelease comparator
  ['2.0.0-rc.1', '^1.2.3', false, 'a prerelease may not slip under a plain upper bound'],
  ['2.0.0-rc.1', '>=1.2.3 <2.0.0', false, 'an explicit plain upper bound admits no prerelease'],
  ['2.0.0-rc.1', '<2.0.0', false, 'a lone plain upper bound admits no prerelease'],
  ['1.3.0-rc.1', '~1.2.3', false, 'a prerelease may not slip under a tilde upper bound'],
  ['1.3.0-rc.1', '1.2.x', false, 'a prerelease may not slip under a wildcard upper bound'],
  ['0.3.0-rc.1', '^0.2.3', false, 'a prerelease may not slip under a zero-minor caret bound'],
  ['0.0.4-rc.1', '^0.0.3', false, 'a prerelease may not slip under a zero-patch caret bound'],
  ['1.5.0-rc.1', '1.x', false, 'an interior prerelease is still rejected by a plain range'],
  ['1.5.0-rc.1', '>=1.0.0 <2.0.0', false, 'an interior prerelease is still rejected by plain comparators'],
  ['1.0.0-rc.1', '*', false, '* admits no prerelease'],
  ['0.0.0-rc.1', '*', false, '* admits no prerelease at the bottom of the order'],
  ['4.5.6-rc.1', '', false, 'an empty range admits no prerelease'],

  // rule 2 is satisfied by a same-tuple prerelease comparator
  ['1.2.3-alpha', '^1.2.3-alpha', true, 'a caret prerelease admits its own anchor'],
  ['1.2.3-beta', '^1.2.3-alpha', true, 'a caret prerelease admits a higher prerelease at the same tuple'],
  ['1.2.3-alpha.1', '^1.2.3-alpha', true, 'a caret prerelease admits a longer prerelease at the same tuple'],
  ['1.2.3-alpha', '^1.2.3-beta', false, 'a caret prerelease still enforces its lower bound'],
  ['1.9.0-beta', '^1.2.3-alpha', false, 'a caret prerelease does not admit a prerelease at another tuple'],
  ['1.2.4-beta', '^1.2.3-alpha', false, 'even the adjacent patch is a different tuple'],
  ['1.9.0', '^1.2.3-alpha', true, 'a release is unaffected by rule 2'],
  ['1.2.3', '^1.2.3-alpha', true, 'a release at the anchor tuple is admitted'],
  ['2.0.0', '^1.2.3-alpha', false, 'a caret prerelease still enforces its upper bound'],
  ['1.2.3-beta', '~1.2.3-alpha', true, 'a tilde prerelease admits a higher prerelease at the same tuple'],
  ['1.2.5-beta', '~1.2.3-alpha', false, 'a tilde prerelease does not admit a prerelease at another tuple'],
  ['1.2.3-rc.5', '>=1.2.3-rc.1 <1.3.0', true, 'one prerelease comparator in the group is enough'],
  ['1.2.9-rc.5', '>=1.2.3-rc.1 <1.3.0', false, 'the prerelease comparator must sit at the version tuple'],
  ['1.2.3-rc.1', '=1.2.3-rc.1', true, 'an exact prerelease term admits its own version'],
  ['1.2.3-rc.2', '=1.2.3-rc.1', false, 'an exact prerelease term admits nothing else'],
  ['1.2.3-rc.1', '1.2.3-rc.1', true, 'a bare prerelease term admits its own version'],
  ['1.2.3', '=1.2.3-rc.1', false, 'an exact prerelease term does not admit the release'],
  ['1.2.3-rc.1', '=1.2.3', false, 'an exact release term does not admit a prerelease'],
  ['1.2.3-rc.1', '1.2.3', false, 'a bare release term does not admit a prerelease'],

  // rule 2 is per-group: another group's prerelease comparator does not help
  ['1.2.3-rc.2', '>=1.2.3-rc.1 <1.2.3-rc.3 || >=1.0.0 <2.0.0', true, 'the prerelease group itself admits rc.2'],
  ['1.2.3-rc.9', '>=1.2.3-rc.1 <1.2.3-rc.3 || >=1.0.0 <2.0.0', false, 'a plain group is not rescued by another group prerelease comparator'],
  ['1.2.3-rc.9', '>=1.2.3-rc.1 <1.2.3-rc.3 || 1.x', false, 'a wildcard group is not rescued by another group prerelease comparator'],
  ['1.5.0-rc.1', '^1.5.0-rc.1 || ^2.0.0', true, 'the group owning the prerelease anchor admits it'],
  ['2.5.0-rc.1', '^1.5.0-rc.1 || ^2.0.0', false, 'the plain group rejects a prerelease at its own tuple-less pool'],
  ['1.5.0', '^1.5.0-rc.1 || ^2.0.0', true, 'a release still matches the prerelease-anchored group'],
];

for (const [version, range, expected, why] of cases) {
  assert.equal(
    satisfies(version, range),
    expected,
    `${why}: satisfies(${JSON.stringify(version)}, ${JSON.stringify(range)}) must be ${expected}`,
  );
}

console.log('ok');
