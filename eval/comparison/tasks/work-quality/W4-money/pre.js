const assert = require('assert');
const money = require('./money.js');
assert.strictEqual(money(123), '$1.23');
assert.strictEqual(money(0), '$0.00');
assert.strictEqual(money(123456), '$1234.56');
console.log('pre ok');
