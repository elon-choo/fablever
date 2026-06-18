const assert=require('assert');const f=require('./bankers.js');
assert.strictEqual(f(0.5),0); assert.strictEqual(f(1.5),2);
assert.strictEqual(f(2.5),2); assert.strictEqual(f(3.5),4);
assert.strictEqual(f(-0.5),0); assert.strictEqual(f(-1.5),-2); assert.strictEqual(f(-2.5),-2);
assert.strictEqual(f(2.4),2); assert.strictEqual(f(2.6),3);
console.log('E6 ok');
