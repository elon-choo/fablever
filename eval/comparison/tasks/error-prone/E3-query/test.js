const assert=require('assert');const f=require('./parse_query.js');
assert.deepStrictEqual(f('a=1&b=2'),{a:'1',b:'2'});
assert.deepStrictEqual(f('a=1&a=2&a=3'),{a:['1','2','3']});
assert.deepStrictEqual(f('x'),{x:''});
assert.deepStrictEqual(f('k='),{k:''});
assert.deepStrictEqual(f(''),{});
console.log('E3 ok');
