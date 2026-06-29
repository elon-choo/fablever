'use strict';

const assert = require('assert');
const { parseConfig } = require('./src/config');

const cfg = parseConfig('# comment\na = 1\nb=2\n\na = 99\nbad line\nc = three\n');
assert.strictEqual(cfg.a, '1'); // first definition wins
assert.strictEqual(cfg.b, '2');
assert.strictEqual(cfg.c, 'three');
assert.strictEqual(Object.keys(cfg).length, 3);

console.log('ok');
