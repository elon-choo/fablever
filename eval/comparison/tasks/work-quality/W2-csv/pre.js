const assert = require('assert');
const toCSV = require('./to_csv.js');
assert.strictEqual(toCSV([['a', 'b'], ['c', 'd']]), 'a,b\nc,d');
assert.strictEqual(toCSV([['x']]), 'x');
console.log('pre ok');
