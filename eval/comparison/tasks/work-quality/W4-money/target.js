const assert = require('assert');
const money = require('./money.js');
assert.strictEqual(money(-123), '-$1.23');
assert.strictEqual(money(-5), '-$0.05');
console.log('target ok');
