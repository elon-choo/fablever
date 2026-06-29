'use strict';

const assert = require('assert');
const { buildIndex, lookup } = require('./src/registry');

const idx = buildIndex([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
assert.strictEqual(lookup(idx, 'a').n, 1);
assert.strictEqual(lookup(idx, 'b').n, 2);
assert.strictEqual(lookup(idx, 'missing'), undefined);

console.log('ok');
