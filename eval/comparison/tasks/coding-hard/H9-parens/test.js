const assert = require('assert');
const evalExpr = require('./eval_expr2.js');
assert.strictEqual(evalExpr('2+3*4'), 14);
assert.strictEqual(evalExpr('2*(3+4)'), 14);
assert.strictEqual(evalExpr('-3+5'), 2);
assert.strictEqual(evalExpr('2*-3'), -6);
assert.strictEqual(evalExpr('(1+2)*(3+4)'), 21);
assert.strictEqual(evalExpr('7/2'), 3);        // truncate, not round (Math.round(3.5)=4)
assert.strictEqual(evalExpr('(0-7)/2'), -3);   // truncate toward zero, not floor (-4)
console.log('H9 ok');
