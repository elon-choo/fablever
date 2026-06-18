const assert=require('assert');const f=require('./flatten_depth.js');
assert.deepStrictEqual(f([1,[2,[3,[4]]]],1),[1,2,[3,[4]]]);
assert.deepStrictEqual(f([1,[2,[3]]],0),[1,[2,[3]]]);
assert.deepStrictEqual(f([1,[2,[3,[4]]]],Infinity),[1,2,3,4]);
assert.deepStrictEqual(f([1,[2,3]]),[1,2,3]);
console.log('E5 ok');
