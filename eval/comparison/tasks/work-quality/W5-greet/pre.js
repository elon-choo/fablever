const assert = require('assert');
const greet = require('./greet.js');
assert.strictEqual(greet('Sam'), 'Hello, Sam!');
assert.strictEqual(greet(''), 'Hello, !');
console.log('pre ok');
