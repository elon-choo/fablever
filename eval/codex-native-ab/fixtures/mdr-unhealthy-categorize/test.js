'use strict';

const assert = require('assert');
const { isUnhealthy } = require('./src/x');

// 2 client errors (404) out of 4 -> error rate 0.5
const codes = [200, 404, 404, 301];
assert.strictEqual(isUnhealthy(codes, 0.4), true);
assert.strictEqual(isUnhealthy(codes, 0.6), false);

// mix of client + server errors -> 2 of 4 -> 0.5
const codes2 = [500, 404, 200, 200];
assert.strictEqual(isUnhealthy(codes2, 0.4), true);

console.log('ok');
