// Covers: the "**" globstar segment, leading-slash alignment, whole-path
// anchoring, and the rule that no wildcard crosses a segment boundary.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'glob-match.mjs')).href;
const { globMatch } = await import(moduleUrl);

assert.equal(typeof globMatch, 'function', 'globMatch must be exported');

const yes = (pattern, p, msg) => assert.equal(globMatch(pattern, p), true, msg);
const no = (pattern, p, msg) => assert.equal(globMatch(pattern, p), false, msg);

// --- globstar matches zero or more segments ---
yes('a/**/b', 'a/b', '** must be able to match zero segments');
yes('a/**/b', 'a/x/b', '** must be able to match one segment');
yes('a/**/b', 'a/x/y/b', '** must be able to match several segments');
no('a/**/b', 'a/x/y', '** does not excuse the trailing segment');
no('a/**/b', 'b', '** does not excuse the leading segment');
no('a/**/b', 'a/b/c', 'the pattern is anchored at the end');
yes('**/b', 'b', 'a leading ** must be able to match zero segments');
yes('**/b', 'x/b', 'a leading ** must be able to match one segment');
yes('**/b', 'x/y/b', 'a leading ** must be able to match several segments');
no('**/b', 'x/y/c', 'a leading ** does not excuse the final segment');
yes('a/**', 'a', 'a trailing ** must be able to match zero segments');
yes('a/**', 'a/b', 'a trailing ** must be able to match one segment');
yes('a/**', 'a/b/c', 'a trailing ** must be able to match several segments');
no('a/**', 'b/c', 'a trailing ** does not excuse the leading segment');
yes('**', '', '** alone matches the empty path');
yes('**', 'a', '** alone matches a one-segment path');
yes('**', 'a/b/c', '** alone matches a multi-segment path');
yes('a/**/**/b', 'a/b', 'two adjacent globstars may both match zero segments');
yes('a/**/**/b', 'a/x/y/b', 'two adjacent globstars must share the middle segments');
yes('**/a/**', 'a', 'globstars on both sides may match zero segments');
yes('**/a/**', 'x/a/y', 'globstars on both sides may match one segment each');
no('**/a/**', 'x/y', 'the literal segment between globstars is required');
yes('**/*.js', 'a.js', '**/ must be optional before a wildcard segment');
yes('**/*.js', 'x/y/a.js', '**/ must span intermediate segments');
no('**/*.js', 'x/y/a.ts', 'the final segment must still match');

// --- ** is a globstar only as a whole segment ---
yes('a**b', 'axyb', '** inside a segment is an ordinary wildcard');
yes('a**b', 'ab', '** inside a segment may match zero characters');
no('a**b', 'a/b', '** inside a segment must not cross a segment boundary');
no('a**b', 'a/x/b', '** inside a segment must not cross a segment boundary');
yes('x/a**', 'x/abc', '** at the end of a segment is an ordinary wildcard');
no('x/a**', 'x/a/b', '** at the end of a segment must not cross a boundary');
yes('\\*\\*', '**', 'an escaped ** segment is a literal name');
no('\\*\\*', 'a/b', 'an escaped ** segment is not a globstar');
no('\\*\\*', 'ab', 'an escaped ** segment is not a wildcard');

// --- leading slash must line up ---
yes('/a/b', '/a/b', 'two absolute inputs must line up');
no('/a/b', 'a/b', 'an absolute pattern must not match a relative path');
no('a/b', '/a/b', 'a relative pattern must not match an absolute path');
no('**', '/a', '** must not swallow the leading slash');
no('**/a', '/a', '** must not swallow the leading slash');
yes('/**', '/a/b', 'an absolute globstar pattern matches an absolute path');
yes('/**', '/', 'an absolute globstar pattern matches the bare root');
no('/**', 'a/b', 'an absolute globstar pattern must not match a relative path');
yes('/*.js', '/a.js', 'an absolute one-segment pattern lines up');
no('/*.js', 'a.js', 'an absolute one-segment pattern needs an absolute path');

// --- anchoring ---
yes('a/b', 'a/b', 'an exact path matches');
no('a/b', 'a/b/c', 'the pattern must consume the whole path');
no('a/b/c', 'a/b', 'the path must satisfy the whole pattern');
no('b', 'a/b', 'a one-segment pattern must not match a suffix');
no('a', 'a/b', 'a one-segment pattern must not match a prefix');
yes('', '', 'the empty pattern matches the empty path');
no('', 'a', 'the empty pattern matches nothing else');
no('a', '', 'a non-empty pattern does not match the empty path');
yes('a/', 'a/', 'a trailing slash produces a trailing empty segment on both sides');
no('a/', 'a', 'a trailing empty segment must be matched');
no('a', 'a/', 'a trailing empty segment must be matched');
yes('a/*', 'a/', '* matches the empty trailing segment');

// --- no wildcard crosses a segment boundary ---
no('*', 'a/b', '* must not cross a segment boundary');
no('a*b', 'a/b', '* must not cross a segment boundary');
no('a*b', 'a/x/b', '* must not cross a segment boundary');
no('a?b', 'a/b', '? must not match a slash');
no('*/*', 'a/b/c', 'two single-star segments match exactly two segments');
yes('*/*', 'a/b', 'two single-star segments match exactly two segments');
no('a[!x]b', 'a/b', 'a negated class must not match a slash');
no('a[/]b', 'a/b', 'a class must not match a slash');
no('a[a-z]b', 'a/b', 'a range must not match a slash');

console.log('ok');
