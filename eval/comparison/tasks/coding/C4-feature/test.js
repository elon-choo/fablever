const assert = require('assert');
const slugify = require('./slugify.js');
const cases = [
  ['Hello World', 'hello-world'],
  ['  Trim  Me  ', 'trim-me'],
  ['a---b', 'a-b'],
  ['-edge-', 'edge'],
  ['Caf\u00e9 D\u00e9j\u00e0', 'cafe-deja'],
  ['Foo_Bar.Baz', 'foo-bar-baz'],
  ['MiXeD CASE', 'mixed-case'],
  ['symbols!@#here', 'symbols-here'],
];
for (const [inp, out] of cases) assert.strictEqual(slugify(inp), out, JSON.stringify(inp));
console.log('C4 ok');
