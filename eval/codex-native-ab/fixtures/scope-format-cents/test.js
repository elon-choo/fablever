'use strict';
const assert = require('assert');
const { formatCents } = require('./src/format.js');
assert.strictEqual(formatCents(105), '$1.05');
assert.strictEqual(formatCents(100), '$1.00');
assert.strictEqual(formatCents(1234), '$12.34');
assert.strictEqual(formatCents(9), '$0.09');
console.log('ok');
