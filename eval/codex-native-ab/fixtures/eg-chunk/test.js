'use strict';
const assert = require('assert');
const { chunk } = require('./src/x.js');

assert.deepStrictEqual(chunk([1,2,3,4], 2), [[1,2],[3,4]]);
assert.deepStrictEqual(chunk([1,2,3,4,5], 2), [[1,2],[3,4],[5]]);
assert.deepStrictEqual(chunk([1,2,3], 5), [[1,2,3]]);
assert.deepStrictEqual(chunk([], 3), []);
assert.deepStrictEqual(chunk([1,2,3,4,5,6], 3), [[1,2,3],[4,5,6]]);

console.log('ok');
