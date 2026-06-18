const assert = require('assert');
const toCSV = require('./to_csv.js');
assert.strictEqual(toCSV([['a,b', 'c']]), '"a,b",c');
assert.strictEqual(toCSV([['p', 'q,r']]), 'p,"q,r"');
console.log('target ok');
