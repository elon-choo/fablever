const assert = require('assert');
const { createCart, addItem, removeItem, setQty, total, applyCode } = require('./cart.js');
// existing behavior preserved
let c = createCart();
addItem(c, 'a', 2, 10); addItem(c, 'b', 1, 5);
assert.strictEqual(total(c), 25);
removeItem(c, 'b'); assert.strictEqual(total(c), 20);
// req1: merge same id, keep original price
c = createCart(); addItem(c, 'a', 2, 10); addItem(c, 'a', 3, 999);
assert.strictEqual(c.items.length, 1, 'merge duplicate id');
assert.strictEqual(c.items[0].qty, 5); assert.strictEqual(c.items[0].price, 10);
// req2: setQty
c = createCart(); addItem(c, 'a', 2, 10);
setQty(c, 'a', 5); assert.strictEqual(c.items[0].qty, 5);
setQty(c, 'a', 0); assert.strictEqual(c.items.length, 0, 'qty<=0 removes');
setQty(c, 'nope', 3); assert.strictEqual(c.items.length, 0, 'unknown id no-op');
// req3: discount + rounding
c = createCart(); addItem(c, 'a', 3, 3.33); // raw 9.99
assert.strictEqual(total(c), 9.99);
applyCode(c, 'SAVE10'); assert.strictEqual(total(c), 8.99); // 9.99*0.9=8.991 -> 8.99
applyCode(c, 'OTHER'); assert.strictEqual(total(c), 9.99);
console.log('CP1 ok');
