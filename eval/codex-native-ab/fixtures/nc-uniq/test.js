'use strict';
const assert = require('assert');
const { uniq } = require('./src/uniq');
assert.deepStrictEqual(uniq([1, 2, 2, 3, 1]), [1, 2, 3]);
assert.deepStrictEqual(uniq(['a', 'a', 'b']), ['a', 'b']);
console.log('ok');
