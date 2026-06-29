'use strict';
const assert = require('assert');
const { parseQuery } = require('./src/parseQuery.js');
assert.deepStrictEqual(parseQuery('a=1&b=2'), { a: '1', b: '2' });
assert.deepStrictEqual(parseQuery('name=John%20Doe'), { name: 'John Doe' });
assert.deepStrictEqual(parseQuery('q=a%26b'), { q: 'a&b' });
console.log('ok');
