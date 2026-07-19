// Slice 2: the power operator and how it interacts with unary signs and the other operators.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
if (!solutionDir) {
  process.stderr.write('usage: node check2.mjs <solution-dir>\n');
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.join(path.resolve(solutionDir), 'expr-eval.mjs')).href;
const { evalExpr } = await import(moduleUrl);

assert.equal(typeof evalExpr, 'function', 'evalExpr must be exported');

// --- the basics ------------------------------------------------------------
assert.deepEqual(evalExpr('2^3'), { value: 8 }, 'a power');
assert.deepEqual(evalExpr('4^0.5'), { value: 2 }, 'a fractional exponent');
assert.deepEqual(evalExpr('2^0'), { value: 1 }, 'a zero exponent');

// --- ^ binds tighter than a unary sign on its left -------------------------
assert.deepEqual(evalExpr('-2^2'), { value: -4 }, '-2^2 is -(2^2)');
assert.deepEqual(evalExpr('(-2)^2'), { value: 4 }, 'parentheses give the other reading');
assert.deepEqual(evalExpr('- -2^2'), { value: 4 }, 'stacked unary applied to a power');
assert.deepEqual(evalExpr('-3^3'), { value: -27 }, '-3^3 is -(3^3)');
assert.deepEqual(evalExpr('+2^2'), { value: 4 }, 'a leading unary plus over a power');

// --- ^ is right-associative ------------------------------------------------
assert.deepEqual(evalExpr('2^3^2'), { value: 512 }, '2^3^2 is 2^(3^2)');
assert.deepEqual(evalExpr('(2^3)^2'), { value: 64 }, 'parentheses force the left grouping');
assert.deepEqual(evalExpr('2^2^3'), { value: 256 }, '2^2^3 is 2^(2^3)');
assert.deepEqual(evalExpr('2^(3^2)'), { value: 512 }, 'the explicit right grouping agrees');

// --- the exponent may be a unary expression --------------------------------
assert.deepEqual(evalExpr('2^-1'), { value: 0.5 }, 'a signed exponent');
assert.deepEqual(evalExpr('2^-2'), { value: 0.25 }, 'another signed exponent');
assert.deepEqual(evalExpr('-2^-2'), { value: -0.25 }, '-2^-2 is -(2^(-2))');
assert.deepEqual(evalExpr('2^+2'), { value: 4 }, 'a unary plus exponent');
assert.deepEqual(evalExpr('2^- -2'), { value: 4 }, 'a stacked-unary exponent');
assert.deepEqual(evalExpr('2^-3^2'), { value: 0.001953125 }, '2^-3^2 is 2^(-(3^2))');
assert.deepEqual(evalExpr('-2^-3^2'), { value: -0.001953125 }, '-2^-3^2 is -(2^(-(3^2)))');

// --- ^ against the other operators -----------------------------------------
assert.deepEqual(evalExpr('2*3^2'), { value: 18 }, '^ binds tighter than *');
assert.deepEqual(evalExpr('2^3*2'), { value: 16 }, '^ binds tighter than * on the left too');
assert.deepEqual(evalExpr('1+2^3'), { value: 9 }, '^ binds tighter than +');
assert.deepEqual(evalExpr('2^3-1'), { value: 7 }, '^ binds tighter than -');
assert.deepEqual(evalExpr('2^3%5'), { value: 3 }, '^ binds tighter than %');
assert.deepEqual(evalExpr('(1+1)^(1+2)'), { value: 8 }, 'groups on both sides of ^');
assert.deepEqual(evalExpr('2 ^ 3 ^ 2'), { value: 512 }, 'whitespace around ^ is ignored');
assert.deepEqual(evalExpr('2^-1*8'), { value: 4 }, 'a signed exponent stops before *');

console.log('ok');
