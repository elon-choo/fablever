const assert = require('assert');
const insert = require('./insert_interval.js');
assert.deepStrictEqual(insert([[1, 3], [6, 9]], [2, 5]), [[1, 5], [6, 9]]);
assert.deepStrictEqual(insert([[1, 3], [5, 7]], [3, 5]), [[1, 7]]);            // touching merges
assert.deepStrictEqual(insert([], [2, 4]), [[2, 4]]);
assert.deepStrictEqual(insert([[1, 2], [4, 5]], [6, 7]), [[1, 2], [4, 5], [6, 7]]);
assert.deepStrictEqual(insert([[1, 5]], [2, 3]), [[1, 5]]);
console.log('H3 ok');
