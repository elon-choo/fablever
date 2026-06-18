const assert = require('assert');
const unique = require('./unique.js');
assert.deepStrictEqual(unique([1, 2, 2, 3, 1]), [1, 2, 3]);
assert.deepStrictEqual(unique(['a', 'b', 'a']), ['a', 'b']);
assert.deepStrictEqual(unique([3, 1, 2]), [3, 1, 2]);
console.log('pre ok');
