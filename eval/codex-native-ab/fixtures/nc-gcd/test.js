'use strict';
const assert = require('assert');
const { gcd } = require('./src/gcd');
assert.strictEqual(gcd(12, 18), 6);
assert.strictEqual(gcd(7, 5), 1);
console.log('ok');
