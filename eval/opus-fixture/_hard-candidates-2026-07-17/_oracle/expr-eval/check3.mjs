// Slice 3: the four error messages, their offsets, and which error wins.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check3.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'expr-eval.mjs')).href;
const { evalExpr } = await import(moduleUrl);

assert.equal(typeof evalExpr, 'function', 'evalExpr must be exported');

const fails = (src, message, offset, why) =>
  assert.deepEqual(evalExpr(src), { error: { message, offset } }, why);

// --- division and modulo by zero -------------------------------------------
fails('1/0', 'division by zero', 1, 'the offset is the operator, not the divisor');
fails('1 / 0', 'division by zero', 2, 'the operator offset survives whitespace');
fails('5%0', 'division by zero', 1, '% by zero reports the same message as /');
fails('5 % 0', 'division by zero', 2, 'the % offset survives whitespace');
fails('1/(2-2)', 'division by zero', 1, 'a computed zero divisor still reports the operator');
fails('1/-0', 'division by zero', 1, 'a divisor of -0 counts as zero');
fails('8/(3^0-1)', 'division by zero', 1, 'a divisor computed through a power');
fails('0/0', 'division by zero', 1, 'zero divided by zero');
fails('2*3/0', 'division by zero', 3, 'the offset of the failing operator in a chain');

// --- evaluation order picks the first division by zero ---------------------
fails('1/(2/0)', 'division by zero', 4, 'the inner / is reached first');
fails('(1/0)+(2/0)', 'division by zero', 2, 'the left operand of + is evaluated first');
fails('1/0/0', 'division by zero', 1, '1/0/0 is (1/0)/0, so the first / wins');
fails('(1%0)*(2/0)', 'division by zero', 2, 'the leftmost failing operator wins');

// --- unexpected character --------------------------------------------------
fails('@', 'unexpected character', 0, 'an invalid character at the start');
fails('1 + @', 'unexpected character', 4, 'an invalid character mid-expression');
fails('1 + 2a', 'unexpected character', 5, 'a letter after a literal');
fails('.', 'unexpected character', 0, 'a lone dot is not a number');
fails('1 + .', 'unexpected character', 4, 'a dot with no digits after it');
fails('1 + * 2', 'unexpected character', 4, 'an operator where an operand was required');
fails('*2', 'unexpected character', 0, 'a binary operator cannot start an expression');
fails('1 ^ ^ 2', 'unexpected character', 4, 'an exponent must be an operand');

// --- unexpected character: unmatched ) and leftovers -----------------------
fails(')', 'unexpected character', 0, 'a closing paren where an operand was required');
fails('1)', 'unexpected character', 1, 'an unmatched closing paren after an expression');
fails('(1))', 'unexpected character', 3, 'an extra closing paren after a group');
fails('1 + )', 'unexpected character', 4, 'a closing paren instead of an operand');
fails('1 2', 'unexpected character', 2, 'a second literal after a complete expression');
fails('1.2.3', 'unexpected character', 3, 'a second dot starts a new literal, which is leftover');
fails('(1)(2)', 'unexpected character', 3, 'a second group after a complete expression');

// --- unexpected end of input -----------------------------------------------
fails('', 'unexpected end of input', 0, 'the empty string');
fails('   ', 'unexpected end of input', 3, 'whitespace only, offset is src.length');
fails('1 +', 'unexpected end of input', 3, 'a trailing binary operator');
fails('1 + ', 'unexpected end of input', 4, 'offset is src.length, so trailing space counts');
fails('1 +   ', 'unexpected end of input', 6, 'a longer whitespace tail still ends at src.length');
fails('-', 'unexpected end of input', 1, 'a lone unary sign');
fails('(', 'unexpected end of input', 1, 'an operand is still required inside a fresh group');
fails('1 + (', 'unexpected end of input', 5, 'an empty group at the end of the input');
fails('2^', 'unexpected end of input', 2, 'a missing exponent');

// --- expected ) ------------------------------------------------------------
fails('(1', 'expected )', 2, 'an unclosed group, offset is src.length');
fails('(1+2', 'expected )', 4, 'a longer unclosed group');
fails('(1 2)', 'expected )', 5, 'the offset is src.length, not the position of the 2');
fails('((1)', 'expected )', 4, 'only the outer group is unclosed');
fails('2*(3+4', 'expected )', 6, 'an unclosed group after an operator');

// --- parsing beats evaluation ----------------------------------------------
fails('1/0 + @', 'unexpected character', 6, 'a later syntax error outranks the division by zero');
fails('1/0)', 'unexpected character', 3, 'a trailing unmatched paren outranks the division');
fails('(1/0', 'expected )', 4, 'an unclosed group outranks the division by zero');
fails('1/0 +', 'unexpected end of input', 5, 'an incomplete tail outranks the division by zero');
fails('1/0 2', 'unexpected character', 4, 'leftover input outranks the division by zero');

// --- the earliest parse problem wins ---------------------------------------
fails('1 + * @', 'unexpected character', 4, 'the * is reached before the @');

// --- and valid input still succeeds ----------------------------------------
assert.deepEqual(evalExpr('1/2'), { value: 0.5 }, 'a non-zero divisor is fine');
assert.deepEqual(evalExpr('0/5'), { value: 0 }, 'a zero dividend is fine');
assert.deepEqual(evalExpr('5%3'), { value: 2 }, 'a non-zero modulus is fine');

console.log('ok');
