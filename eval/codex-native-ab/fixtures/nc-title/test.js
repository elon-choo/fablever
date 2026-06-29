'use strict';
const assert = require('assert');
const { titleCase } = require('./src/title');
assert.strictEqual(titleCase('hello world'), 'Hello World');
assert.strictEqual(titleCase('a b c'), 'A B C');
console.log('ok');
