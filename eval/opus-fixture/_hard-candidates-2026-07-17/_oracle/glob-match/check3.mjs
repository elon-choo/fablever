// Covers: matching inside a single segment — * backtracking, ?, and the
// character-class grammar (ranges, negation, literal ] and -, unterminated [,
// escapes inside a class) plus case sensitivity.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'glob-match.mjs')).href;
const { globMatch } = await import(moduleUrl);

assert.equal(typeof globMatch, 'function', 'globMatch must be exported');

const yes = (pattern, p, msg) => assert.equal(globMatch(pattern, p), true, msg);
const no = (pattern, p, msg) => assert.equal(globMatch(pattern, p), false, msg);

// --- * ---
yes('a*b', 'ab', '* matches zero characters');
yes('a*b', 'axb', '* matches one character');
yes('a*b', 'axyzb', '* matches several characters');
no('a*b', 'ab.', '* is anchored at the end');
no('a*b', '.ab', '* is anchored at the start');
yes('*', '', '* alone matches the empty segment');
yes('*', 'anything', '* alone matches any segment');
yes('*.js', 'a.js', 'a leading * must give back characters');
yes('*.js', 'a.b.js', '* must give back so the literal suffix can match');
yes('*.js', '.js', '* may match nothing before the suffix');
no('*.js', 'a.js.txt', 'a trailing literal must land at the end');
yes('*a*b', 'xaybzb', 'two stars must backtrack independently');
yes('*a*b', 'ab', 'both stars may match nothing');
no('*a*b', 'xayb.', 'backtracking must not break anchoring');
yes('a*a', 'aa', 'a greedy star must give back to let a literal match');
yes('*a', 'aaa', 'a greedy star must give back to let a literal match');
yes('a*b*c', 'abcbc', 'stars must backtrack across several literals');
no('a*b*c', 'abcb', 'the final literal is still required');
yes('**b', 'aab', 'consecutive stars inside a segment behave like one star');

// --- ? ---
yes('a?b', 'axb', '? matches exactly one character');
no('a?b', 'ab', '? must match one character, not zero');
no('a?b', 'axyb', '? must match exactly one character');
yes('?', 'a', '? alone matches a one-character segment');
no('?', '', '? does not match the empty segment');
yes('???', 'abc', 'three ? match three characters');
no('???', 'ab', 'three ? require three characters');
yes('a?*', 'ax', '? and * combine');
no('a?*', 'a', '? is still required next to a *');

// --- character classes: basics ---
yes('[abc]', 'b', 'a class matches a listed character');
no('[abc]', 'd', 'a class does not match an unlisted character');
no('[abc]', 'ab', 'a class matches exactly one character');
yes('[a-z]*', 'hello', 'a range matches inside it');
no('[a-z]*', 'Hello', 'a range is case-sensitive');
yes('[A-Z]', 'Q', 'an uppercase range matches uppercase');
no('[A-Z]', 'a', 'an uppercase range does not match lowercase');
yes('[0-9][0-9]', '42', 'digit ranges match digits');
no('[0-9][0-9]', '4x', 'digit ranges reject non-digits');
yes('x[a-cx-z]y', 'xby', 'a class may hold two ranges');
yes('x[a-cx-z]y', 'xyy', 'a class may hold two ranges');
no('x[a-cx-z]y', 'xdy', 'a class with two ranges rejects the gap');
yes('[a-z0-9_]*', 'a1_z', 'ranges and singles may mix');

// --- character classes: negation ---
yes('[!abc]', 'd', '[!...] negates');
no('[!abc]', 'a', '[!...] negates');
yes('[^abc]', 'd', '[^...] negates too');
no('[^abc]', 'a', '[^...] negates too');
yes('[!a-z]*', 'Hello', 'a negated range matches outside it');
no('[!a-z]*', 'hello', 'a negated range rejects inside it');
yes('*.[!o]', 'main.c', 'a negated class works after a wildcard');
no('*.[!o]', 'main.o', 'a negated class works after a wildcard');

// --- character classes: literal ] and - ---
yes('[]]', ']', 'a leading ] in a class body is literal');
no('[]]', 'a', 'a leading ] in a class body is literal');
yes('[]a]', 'a', 'a leading ] does not close the class');
yes('[]a]', ']', 'a leading ] does not close the class');
no('[]a]', 'b', 'a leading ] does not close the class');
yes('[!]]', 'a', 'a leading ] after ! is literal');
no('[!]]', ']', 'a leading ] after ! is literal');
yes('[a-]', '-', 'a trailing - is literal');
yes('[a-]', 'a', 'a trailing - is literal');
no('[a-]', 'b', 'a trailing - is literal, not a range');
yes('[-a]', '-', 'a leading - is literal');
yes('[-a]', 'a', 'a leading - is literal');
no('[-a]', 'b', 'a leading - is literal, not a range');
yes('[a-c-e]', 'b', 'a range may be followed by a literal -');
yes('[a-c-e]', '-', 'a range may be followed by a literal -');
yes('[a-c-e]', 'e', 'a range may be followed by a literal -');
no('[a-c-e]', 'd', 'the literal - does not create a second range');

// --- character classes: unterminated [ is literal ---
yes('a[b', 'a[b', 'an unterminated [ is a literal [');
no('a[b', 'b', 'an unterminated [ is a literal [');
yes('[]', '[]', 'a class body that starts with ] and never closes is literal');
yes('[abc', '[abc', 'an unterminated class is literal text');
yes('a[*]b', 'a*b', 'a class may hold a wildcard character literally');
no('a[*]b', 'axb', 'a wildcard inside a class is literal');

// --- character classes: escapes inside ---
yes('[\\]]', ']', 'an escaped ] inside a class is literal');
no('[\\]]', 'a', 'an escaped ] inside a class is literal');
yes('[a\\-z]', '-', 'an escaped - is literal, not a range');
yes('[a\\-z]', 'a', 'an escaped - is literal, not a range');
yes('[a\\-z]', 'z', 'an escaped - is literal, not a range');
no('[a\\-z]', 'b', 'an escaped - must not build a range');
yes('[\\\\]', '\\', 'an escaped backslash inside a class matches a backslash');

// --- case sensitivity and combinations ---
no('abc', 'ABC', 'literal matching is case-sensitive');
yes('abc', 'abc', 'literal matching is exact');
yes('[a-z]?[0-9]*', 'ab3xyz', 'classes, ? and * combine within a segment');
no('[a-z]?[0-9]*', 'ab_xyz', 'every element of the segment must match');
yes('src/[a-z]*-?[0-9].{js,ts}', 'src/util-a1.ts', 'the whole syntax composes');
no('src/[a-z]*-?[0-9].{js,ts}', 'src/util-a1.md', 'the whole syntax composes');

console.log('ok');
