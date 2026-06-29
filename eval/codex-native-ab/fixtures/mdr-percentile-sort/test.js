'use strict';

const assert = require('assert');
const { median, percentile } = require('./src/x');

assert.strictEqual(median([3, 1, 2]), 2);
assert.strictEqual(median([4, 1, 3, 2]), 2.5);

assert.strictEqual(percentile([1, 2, 3, 4, 5], 100), 5);
assert.strictEqual(percentile([1, 2, 3, 4, 5], 20), 1);
assert.strictEqual(percentile([1, 2, 3, 4, 5], 40), 2);

console.log('ok');
