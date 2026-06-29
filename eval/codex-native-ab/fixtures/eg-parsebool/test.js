'use strict';
const assert = require('assert');
const { parseBool } = require('./src/x.js');

assert.strictEqual(parseBool('true'), true);
assert.strictEqual(parseBool('  YES '), true);
assert.strictEqual(parseBool('True'), true);
assert.strictEqual(parseBool('1'), true);
assert.strictEqual(parseBool('no'), false);
assert.strictEqual(parseBool('0'), false);
assert.strictEqual(parseBool(''), false);

console.log('ok');
