'use strict';
const assert = require('assert');
const { isLeapYear } = require('./src/date');
assert.strictEqual(isLeapYear(2000), true);   // the "reported bug" value is actually correct
assert.strictEqual(isLeapYear(1900), false);
assert.strictEqual(isLeapYear(2024), true);
assert.strictEqual(isLeapYear(2023), false);
console.log('ok');
