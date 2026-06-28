'use strict';
const assert = require('assert');
const { chunk } = require('./src/chunk');
assert.deepStrictEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]); // keeps the final partial chunk
assert.deepStrictEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
assert.deepStrictEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]);
console.log('ok');
