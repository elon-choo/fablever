const assert = require('assert');
const createUser = require('./create_user.js');
assert.deepStrictEqual(createUser({ name: 'a' }), { name: 'a', age: undefined, role: 'member' });
assert.strictEqual(createUser({ name: 'b', role: 'admin' }).role, 'admin');
assert.strictEqual(createUser({ name: 'c', age: 5 }).age, 5);
console.log('pre ok');
