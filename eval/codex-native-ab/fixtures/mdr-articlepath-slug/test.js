'use strict';

const assert = require('assert');
const { articlePath } = require('./src/x');

assert.strictEqual(articlePath('blog', ['Hello', 'World']), '/blog/hello-world');
assert.strictEqual(articlePath('news', ['Big News']), '/news/big-news');

console.log('ok');
