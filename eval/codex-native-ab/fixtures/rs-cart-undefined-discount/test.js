'use strict';

const assert = require('assert');
const { cartTotal } = require('./src/cart');

assert.strictEqual(cartTotal([{ price: 10, qty: 2 }, { price: 5, qty: 1 }], 0), 25);
assert.strictEqual(cartTotal([{ price: 100, qty: 1 }], 10), 90);
assert.strictEqual(cartTotal([{ price: 19.99, qty: 3 }], 25), 44.98);
assert.strictEqual(cartTotal([], 50), 0);

console.log('ok');
