'use strict';
const assert = require('assert');
const { subtotal } = require('./src/cart');
assert.strictEqual(subtotal([{ price: 2, qty: 3 }]), 6);                      // 2*3
assert.strictEqual(subtotal([{ price: 5, qty: 2 }, { price: 1, qty: 4 }]), 14); // 10 + 4
console.log('ok');
