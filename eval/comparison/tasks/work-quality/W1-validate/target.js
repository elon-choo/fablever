const assert = require('assert');
const createUser = require('./create_user.js');
let t = 0;
for (const bad of [-1, 0, 2.5]) { try { createUser({ name: 'd', age: bad }); } catch (_) { t++; } }
assert.strictEqual(t, 3, 'must reject non-positive-integer age');
assert.strictEqual(createUser({ name: 'e', age: 3 }).age, 3);
console.log('target ok');
