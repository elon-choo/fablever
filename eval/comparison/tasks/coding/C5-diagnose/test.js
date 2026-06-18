const assert = require('assert');
const createCache = require('./cache.js');
const clock = { t: 1000 };
const c = createCache(() => clock.t);
c.set('k', 'x', 100);
assert.strictEqual(c.get('k'), 'x');
clock.t += 50;
assert.strictEqual(c.get('k'), 'x');
clock.t += 100; // now 1150 >= 1100 -> expired
assert.strictEqual(c.get('k'), undefined);
console.log('C5 ok');
