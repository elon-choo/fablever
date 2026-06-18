const assert = require('assert');
const parseRange = require('./parse_range.js');
assert.deepStrictEqual(parseRange('1-3'), [1, 2, 3]);
assert.deepStrictEqual(parseRange('5-5'), [5]);
assert.deepStrictEqual(parseRange('2-4'), [2, 3, 4]);
console.log('C1 ok');
