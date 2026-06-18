const assert=require('assert');const f=require('./diff_count.js');
assert.deepStrictEqual(f([1,2,2,3],[2,3,3,4]),{added:[3,4],removed:[1,2]});
assert.deepStrictEqual(f([1,1,1],[1]),{added:[],removed:[1,1]});
assert.deepStrictEqual(f([],[5,5]),{added:[5,5],removed:[]});
assert.deepStrictEqual(f([1,2],[1,2]),{added:[],removed:[]});
console.log('E4 ok');
