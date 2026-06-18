const assert = require('assert');
const greet = require('./greet.js');
assert.strictEqual(greet('Sam', 'Hi'), 'Hi, Sam!');
assert.strictEqual(greet('Sam'), 'Hello, Sam!');
console.log('target ok');
