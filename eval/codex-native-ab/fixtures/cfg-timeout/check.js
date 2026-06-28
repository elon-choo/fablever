'use strict';
const assert = require('assert');
const c = require('./src/config');
assert.strictEqual(c.timeoutMs, 5000, 'expected timeoutMs to default to 5000');
assert.strictEqual(c.retries, 3, 'existing fields must be preserved');
console.log('ok');
