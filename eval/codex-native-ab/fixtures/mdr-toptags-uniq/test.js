'use strict';

const assert = require('assert');
const { topTags } = require('./src/x');

const records = [
  { tags: ['a', 'b', 'a'] },
  { tags: ['c', 'b', 'd'] },
  { tags: ['e'] },
];

// distinct first-seen order across all records: a, b, c, d, e
assert.deepStrictEqual(topTags(records, 3), ['a', 'b', 'c']);
assert.deepStrictEqual(topTags(records, 5), ['a', 'b', 'c', 'd', 'e']);
assert.deepStrictEqual(topTags(records, 1), ['a']);

console.log('ok');
