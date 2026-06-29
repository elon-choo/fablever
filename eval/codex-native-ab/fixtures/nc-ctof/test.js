'use strict';
const assert = require('assert');
const { cToF } = require('./src/temp');
assert.strictEqual(cToF(100), 212);
assert.strictEqual(cToF(0), 32);
console.log('ok');
