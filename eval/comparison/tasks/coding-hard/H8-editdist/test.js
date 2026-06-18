const assert = require('assert');
const editDistance = require('./edit_distance.js');
assert.strictEqual(editDistance('', ''), 0);
assert.strictEqual(editDistance('abc', 'abc'), 0);
assert.strictEqual(editDistance('a', 'b'), 2);          // substitute costs 2 (Levenshtein would say 1)
assert.strictEqual(editDistance('abc', ''), 3);
assert.strictEqual(editDistance('kitten', 'sitting'), 5);
assert.strictEqual(editDistance('flaw', 'lawn'), 2);
console.log('H8 ok');
