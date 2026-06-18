const assert=require('assert');const f=require('./window_max.js');
assert.deepStrictEqual(f([1,3,2,5,4],2),[3,3,5,5]);
assert.deepStrictEqual(f([4,2,1],3),[4]);
assert.deepStrictEqual(f([1,2],3),[]);
assert.deepStrictEqual(f([7,7,7],1),[7,7,7]);
assert.deepStrictEqual(f([5],1),[5]);
console.log('E2 ok');
