const assert = require('assert');
const createLRU = require('./lru.js');
const L = createLRU(2);
L.put('a', 1); L.put('b', 2);
assert.strictEqual(L.get('a'), 1);     // refresh a -> b is now LRU
L.put('c', 3);                          // evict b, keep a and c
assert.strictEqual(L.get('b'), undefined);
assert.strictEqual(L.get('a'), 1);
assert.strictEqual(L.get('c'), 3);
console.log('H4 ok');
