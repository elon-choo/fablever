const assert = require('assert');
const flatten = require('./flatten.js');
assert.deepStrictEqual(flatten([1, [2, 3], 4]), [1, 2, 3, 4]);
assert.deepStrictEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
assert.deepStrictEqual(flatten([]), []);
assert.deepStrictEqual(flatten([[1], [2, [3]]]), [1, 2, 3]);
console.log('C2 ok');
