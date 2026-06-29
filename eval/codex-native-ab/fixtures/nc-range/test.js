'use strict';
const assert = require('assert');
const { range } = require('./src/range');
assert.deepStrictEqual(range(1, 5), [1, 2, 3, 4]);
assert.deepStrictEqual(range(0, 3), [0, 1, 2]);
console.log('ok');
