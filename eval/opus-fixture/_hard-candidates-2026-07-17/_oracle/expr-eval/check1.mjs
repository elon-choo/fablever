// Slice 1: number literals, whitespace, the low-precedence operators, and grouping.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check1.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'expr-eval.mjs')).href;
const { evalExpr } = await import(moduleUrl);

assert.equal(typeof evalExpr, 'function', 'evalExpr must be exported');

// --- number literals -------------------------------------------------------
assert.deepEqual(evalExpr('12'), { value: 12 }, 'an integer literal');
assert.deepEqual(evalExpr('3.5'), { value: 3.5 }, 'a decimal literal');
assert.deepEqual(evalExpr('.5'), { value: 0.5 }, 'a literal may start with a dot');
assert.deepEqual(evalExpr('.125'), { value: 0.125 }, 'a dot literal with several digits');
assert.deepEqual(evalExpr('7.'), { value: 7 }, 'a literal may end with a dot');
assert.deepEqual(evalExpr('12.75'), { value: 12.75 }, 'digits on both sides of the dot');
assert.deepEqual(evalExpr('0'), { value: 0 }, 'zero is a literal like any other');

// --- grouping and precedence ----------------------------------------------
assert.deepEqual(evalExpr('1+2'), { value: 3 }, 'addition');
assert.deepEqual(evalExpr('2+3*4'), { value: 14 }, '* binds tighter than +');
assert.deepEqual(evalExpr('2*3+4'), { value: 10 }, '* binds tighter than + on the left too');
assert.deepEqual(evalExpr('(2+3)*4'), { value: 20 }, 'parentheses override precedence');
assert.deepEqual(evalExpr('2*(3+4)'), { value: 14 }, 'a group on the right of *');
assert.deepEqual(evalExpr('(((7)))'), { value: 7 }, 'nested redundant groups');
assert.deepEqual(evalExpr('(1+2)*(3+4)'), { value: 21 }, 'a group on each side of *');
assert.deepEqual(evalExpr('10-2*3'), { value: 4 }, '* binds tighter than -');

// --- left associativity ----------------------------------------------------
assert.deepEqual(evalExpr('10-2-3'), { value: 5 }, '- is left-associative: (10-2)-3');
assert.deepEqual(evalExpr('10-(2-3)'), { value: 11 }, 'parentheses regroup a - chain');
assert.deepEqual(evalExpr('100/5/2'), { value: 10 }, '/ is left-associative: (100/5)/2');
assert.deepEqual(evalExpr('100/(5/2)'), { value: 40 }, 'parentheses regroup a / chain');
assert.deepEqual(evalExpr('7%5%3'), { value: 2 }, '% is left-associative: (7%5)%3');
assert.deepEqual(evalExpr('1-2+3'), { value: 2 }, '+ and - share precedence, left to right');
assert.deepEqual(evalExpr('8/4*2'), { value: 4 }, '* and / share precedence, left to right');

// --- unary binds tighter than * / % ---------------------------------------
assert.deepEqual(evalExpr('-5%3'), { value: -2 }, 'unary binds tighter than %: (-5)%3');
assert.deepEqual(evalExpr('2*-3'), { value: -6 }, 'an operand may carry a unary sign');
assert.deepEqual(evalExpr('- -3'), { value: 3 }, 'stacked unary minus');
assert.deepEqual(evalExpr('-+-3'), { value: 3 }, 'stacked mixed unary signs');
assert.deepEqual(evalExpr('+7'), { value: 7 }, 'a leading unary plus');
assert.deepEqual(evalExpr('-(2+3)'), { value: -5 }, 'unary minus applied to a group');

// --- plain JavaScript number arithmetic -----------------------------------
assert.deepEqual(evalExpr('1/4'), { value: 0.25 }, 'division produces a fraction');
assert.deepEqual(evalExpr('.1+.2'), { value: 0.1 + 0.2 }, 'results are not rounded');
assert.deepEqual(evalExpr('5.5%2'), { value: 1.5 }, '% works on non-integers');
assert.deepEqual(evalExpr('3.5*2'), { value: 7 }, 'decimal multiplication');

// --- whitespace ------------------------------------------------------------
assert.deepEqual(evalExpr('  1  +  2  '), { value: 3 }, 'runs of spaces are ignored');
assert.deepEqual(evalExpr('1\t+\n2'), { value: 3 }, 'tabs and newlines are whitespace');
assert.deepEqual(evalExpr('  (  2 + 3 )  *  4 '), { value: 20 }, 'whitespace around groups');
assert.deepEqual(evalExpr(' 42 '), { value: 42 }, 'a padded lone literal');

console.log('ok');
