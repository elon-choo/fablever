'use strict';

const assert = require('assert');
const { median } = require('./src/stats');

assert.strictEqual(median([3, 1, 2]), 2);
assert.strictEqual(median([5, 1, 9, 2, 7]), 5);
assert.strictEqual(median([10]), 10);
assert.strictEqual(median([-5, -1, -3]), -3);

console.log('ok');
