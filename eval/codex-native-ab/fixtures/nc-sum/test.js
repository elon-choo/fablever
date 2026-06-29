'use strict';
const assert = require('assert');
const { sum } = require('./src/sum');
assert.strictEqual(sum([1, -2, 3]), 2);
assert.strictEqual(sum([]), 0);
console.log('ok');
