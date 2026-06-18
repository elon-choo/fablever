const assert=require('assert');const f=require('./intersect.js');
assert.deepStrictEqual(f([[0,2],[5,10]],[[1,6]]),[[1,2],[5,6]]);
assert.deepStrictEqual(f([[1,3]],[[3,5]]),[[3,3]]);
assert.deepStrictEqual(f([[0,4],[7,9]],[[2,3],[8,8]]),[[2,3],[8,8]]);
assert.deepStrictEqual(f([[0,1]],[[2,3]]),[]);
assert.deepStrictEqual(f([],[[1,2]]),[]);
console.log('E1 ok');
