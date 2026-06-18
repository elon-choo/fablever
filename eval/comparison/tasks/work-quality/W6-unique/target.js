const assert = require('assert');
const unique = require('./unique.js');
const r = unique([NaN, 1, NaN, 2]);
assert.strictEqual(r.filter(x => Number.isNaN(x)).length, 1, 'dedupe NaN');
assert.ok(r.includes(1) && r.includes(2));
console.log('target ok');
