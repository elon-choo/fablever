'use strict';
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync('./src/api.js', 'utf8');
assert.ok(/@param/.test(src), 'expected a @param JSDoc tag on fetchUser');
assert.ok(/\bid\b/.test(src) && /\bopts\b/.test(src), 'expected id and opts to be documented');
console.log('ok');
