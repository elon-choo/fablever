const assert = require('assert');
const createLimiter = require('./token_bucket.js');
const a = createLimiter({ capacity: 2, refillPerSec: 1 });
assert.strictEqual(a(0), true);
assert.strictEqual(a(0), true);
assert.strictEqual(a(0), false);
assert.strictEqual(a(10), true);   // refilled, but capped at 2
assert.strictEqual(a(10), true);
assert.strictEqual(a(10), false);  // cap enforced despite 10s idle
console.log('H6 ok');
