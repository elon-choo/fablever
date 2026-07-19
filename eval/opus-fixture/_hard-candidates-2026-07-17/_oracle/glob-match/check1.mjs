// Covers: brace expansion (nesting, cross product, empty/absent alternatives,
// unmatched braces, commas shielded by classes) and backslash escapes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'glob-match.mjs')).href;
const { globMatch } = await import(moduleUrl);

assert.equal(typeof globMatch, 'function', 'globMatch must be exported');

const yes = (pattern, p, msg) => assert.equal(globMatch(pattern, p), true, msg);
const no = (pattern, p, msg) => assert.equal(globMatch(pattern, p), false, msg);

// --- simple alternation ---
yes('{a,b}/c', 'a/c', '{a,b} must match its first alternative');
yes('{a,b}/c', 'b/c', '{a,b} must match its second alternative');
no('{a,b}/c', 'c/c', '{a,b} must not match an unlisted alternative');
yes('x{a,b}y', 'xay', 'a group must combine with surrounding text');
yes('x{a,b}y', 'xby', 'a group must combine with surrounding text');
no('x{a,b}y', 'xy', 'a group with no empty alternative must not match nothing');
yes('{a,b,cc}', 'cc', 'alternatives may have different lengths');
no('{a,b,cc}', 'c', 'a longer alternative must not match a prefix of itself');

// --- cross product of two groups ---
yes('a{b,c}d{e,f}', 'abde', 'two groups must produce a cross product');
yes('a{b,c}d{e,f}', 'abdf', 'two groups must produce a cross product');
yes('a{b,c}d{e,f}', 'acde', 'two groups must produce a cross product');
yes('a{b,c}d{e,f}', 'acdf', 'two groups must produce a cross product');
no('a{b,c}d{e,f}', 'abdg', 'the cross product must not invent alternatives');
no('a{b,c}d{e,f}', 'abd', 'the second group must still be required');

// --- nesting ---
yes('{a,{b,c}d}', 'a', 'a nested group must keep the outer alternatives');
yes('{a,{b,c}d}', 'bd', 'a nested group must expand inside its outer alternative');
yes('{a,{b,c}d}', 'cd', 'a nested group must expand inside its outer alternative');
no('{a,{b,c}d}', 'd', 'the nested group must not vanish');
no('{a,{b,c}d}', 'b', 'text after a nested group must still be required');
yes('{a,b{c,d}e}f', 'af', 'a top-level comma must split only the outer group');
yes('{a,b{c,d}e}f', 'bcef', 'a top-level comma must split only the outer group');
yes('{a,b{c,d}e}f', 'bdef', 'a top-level comma must split only the outer group');
no('{a,b{c,d}e}f', 'bcf', 'the nested alternation must be required');
yes('{{a,b}{c,d},z}', 'bc', 'adjacent nested groups must cross-multiply');
yes('{{a,b}{c,d},z}', 'z', 'adjacent nested groups must not lose the outer alternative');
no('{{a,b}{c,d},z}', 'ab', 'adjacent nested groups must not concatenate alternatives');

// --- degenerate groups ---
yes('{a}', 'a', 'a group with no comma expands to its single content');
no('{a}', '{a}', 'a group with no comma is not literal text');
yes('{a,}z', 'az', 'a trailing empty alternative must keep the non-empty one');
yes('{a,}z', 'z', 'a trailing empty alternative must expand to the empty string');
yes('{,a}z', 'z', 'a leading empty alternative must expand to the empty string');
yes('{}', '', '{} expands to the empty string');
yes('a{}b', 'ab', '{} contributes nothing');

// --- unmatched braces are literal ---
yes('{a', '{a', 'an unmatched { is a literal {');
yes('a}', 'a}', 'an unmatched } is a literal }');
yes('{a/{b,c}', '{a/b', 'an unmatched { must not stop a later group from expanding');
yes('{a/{b,c}', '{a/c', 'an unmatched { must not stop a later group from expanding');
no('{a/{b,c}', 'a/b', 'the unmatched { is part of the pattern text');

// --- commas inside a character class do not split the group ---
yes('{[a,b],z}', ',', 'a comma inside a class must not split the group');
yes('{[a,b],z}', 'a', 'a comma inside a class must not split the group');
yes('{[a,b],z}', 'z', 'the second alternative must survive');
no('{[a,b],z}', 'c', 'the class must still restrict the match');

// --- braces mixed with the rest of the syntax ---
yes('{src,lib}/**/*.{js,mjs}', 'src/a/b/c.mjs', 'alternatives may contain any pattern syntax');
yes('{src,lib}/**/*.{js,mjs}', 'lib/x/y.js', 'alternatives may contain any pattern syntax');
no('{src,lib}/**/*.{js,mjs}', 'test/x/y.js', 'alternatives must still be anchored');
no('{src,lib}/**/*.{js,mjs}', 'src/a/b/c.ts', 'the extension group must still be required');
yes('{/a,b}/c', '/a/c', 'an alternative may supply the leading slash');
yes('{/a,b}/c', 'b/c', 'a sibling alternative may stay relative');
no('{/a,b}/c', 'a/c', 'the leading slash of an alternative must line up');

// --- backslash escapes ---
yes('a\\*b', 'a*b', 'an escaped * matches a literal *');
no('a\\*b', 'axb', 'an escaped * is not a wildcard');
no('a\\*b', 'ab', 'an escaped * is not a wildcard');
yes('a\\?b', 'a?b', 'an escaped ? matches a literal ?');
no('a\\?b', 'axb', 'an escaped ? is not a wildcard');
yes('\\[abc]', '[abc]', 'an escaped [ makes the class literal text');
no('\\[abc]', 'a', 'an escaped [ is not a character class');
yes('\\{a,b\\}', '{a,b}', 'escaped braces are literal and do not alternate');
no('\\{a,b\\}', 'a', 'escaped braces do not alternate');
yes('a\\\\b', 'a\\b', 'an escaped backslash matches one backslash');
no('a\\\\b', 'ab', 'an escaped backslash must consume a character');
yes('a\\', 'a\\', 'a trailing backslash matches a literal backslash');
yes('{a\\,b,c}', 'a,b', 'an escaped comma does not split a group');
yes('{a\\,b,c}', 'c', 'an escaped comma leaves the real alternative intact');
no('{a\\,b,c}', 'a', 'an escaped comma does not split a group');

console.log('ok');
