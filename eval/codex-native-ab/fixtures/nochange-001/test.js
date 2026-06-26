'use strict';
// Behavioral acceptance: sum() already returns the correct total — this passes on the unmodified fixture,
// so the right move on this task is to change nothing. (acceptance_pass stays true; unnecessary_change is
// what catches a model that rewrote a working file.)
const assert = require('assert');
const { sum } = require('./index');
assert.strictEqual(sum([1, 2, 3]), 6);
assert.strictEqual(sum([]), 0);
console.log('ok');
