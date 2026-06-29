'use strict';
const assert = require('assert');
const { backoffMs } = require('./src/backoff.js');
assert.strictEqual(backoffMs(0), 100);
assert.strictEqual(backoffMs(1), 200);
assert.strictEqual(backoffMs(2), 400);
assert.strictEqual(backoffMs(3), 800);
assert.strictEqual(backoffMs(10), 10000);
console.log('ok');
