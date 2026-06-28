'use strict';
const assert = require('assert');
const { normalizePath } = require('./src/normalize');
assert.strictEqual(normalizePath('/a/b/'), '/a/b');  // trailing slash stripped
assert.strictEqual(normalizePath('a/b'), '/a/b');    // leading slash added
assert.strictEqual(normalizePath('/'), '/');         // root stays root
console.log('ok');
