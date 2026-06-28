'use strict';
const assert = require('assert');
const { clamp } = require('./src/math');
assert.strictEqual(clamp(5, 0, 10), 5);    // the "reported bug" value is actually correct
assert.strictEqual(clamp(-3, 0, 10), 0);
assert.strictEqual(clamp(99, 0, 10), 10);
console.log('ok');
