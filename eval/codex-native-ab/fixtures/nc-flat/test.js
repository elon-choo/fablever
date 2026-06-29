'use strict';
const assert = require('assert');
const { flatten } = require('./src/flat');
assert.deepStrictEqual(flatten([[1, 2], [3]]), [1, 2, 3]);
assert.deepStrictEqual(flatten([[1], [2, 3]]), [1, 2, 3]);
console.log('ok');
