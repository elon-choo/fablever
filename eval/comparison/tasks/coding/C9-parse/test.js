const assert = require('assert');
const evalExpr = require('./eval_expr.js');
assert.strictEqual(evalExpr('2+3*4'), 14);
assert.strictEqual(evalExpr('10-2*3'), 4);
assert.strictEqual(evalExpr('8/2+1'), 5);
assert.strictEqual(evalExpr('2*3+4*5'), 26);
console.log('C9 ok');
