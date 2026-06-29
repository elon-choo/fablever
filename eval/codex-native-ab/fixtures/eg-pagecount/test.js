'use strict';
const assert = require('assert');
const { pageCount } = require('./src/x.js');

assert.strictEqual(pageCount(0, 10), 0);
assert.strictEqual(pageCount(10, 10), 1);
assert.strictEqual(pageCount(11, 10), 2);
assert.strictEqual(pageCount(10, 3), 4);
assert.strictEqual(pageCount(9, 3), 3);
assert.strictEqual(pageCount(5, 0), 0);

console.log('ok');
