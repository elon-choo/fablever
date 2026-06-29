'use strict';
const assert = require('assert');
const { paginate } = require('./src/paginate.js');
const items = Array.from({ length: 50 }, (_, i) => i);
assert.deepStrictEqual(paginate(items, 1), items.slice(0, 20));
assert.deepStrictEqual(paginate(items, 3, 5), [10, 11, 12, 13, 14]);
console.log('ok');
