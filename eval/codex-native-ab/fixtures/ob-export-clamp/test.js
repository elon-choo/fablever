'use strict';
const assert = require('assert');
const mod = require('./src/temperature.js');
assert.strictEqual(typeof mod.clamp, 'function', 'clamp should be exported');
assert.strictEqual(mod.clamp(5, 0, 3), 3);
assert.strictEqual(mod.clamp(-1, 0, 3), 0);
assert.strictEqual(mod.toFahrenheit(0), 32);
console.log('ok');
