'use strict';
// Behavioral acceptance: the paginator must NOT return an extra item on a full page. With the live
// off-by-one (end = start + perPage + 1) page 1 of a 5-item list returns 3 items instead of 2 → this fails.
const assert = require('assert');
const { paginate } = require('./src/parser');
const items = [1, 2, 3, 4, 5];
assert.deepStrictEqual(paginate(items, 1, 2), [3, 4]); // page 1, 2/page → exactly items 3 and 4
assert.deepStrictEqual(paginate(items, 0, 2), [1, 2]);
console.log('ok');
