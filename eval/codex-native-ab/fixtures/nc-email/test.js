'use strict';
const assert = require('assert');
const { isValidEmail } = require('./src/validate');
assert.strictEqual(isValidEmail('a+b@example.com'), true);  // plus-addressing already works
assert.strictEqual(isValidEmail('plain@test.io'), true);
assert.strictEqual(isValidEmail('nope'), false);
console.log('ok');
