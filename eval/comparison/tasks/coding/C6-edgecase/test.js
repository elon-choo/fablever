const assert = require('assert');
const splitCsv = require('./split_csv.js');
assert.deepStrictEqual(splitCsv('a;b;c'), ['a', 'b', 'c']);
assert.deepStrictEqual(splitCsv('"x;y";z'), ['x;y', 'z']);
assert.deepStrictEqual(splitCsv('"a""b";c'), ['a"b', 'c']);
assert.deepStrictEqual(splitCsv('p;"q;r";s'), ['p', 'q;r', 's']);
console.log('C6 ok');
