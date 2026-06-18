const assert = require('assert');
const parseRoman = require('./roman.js');
assert.strictEqual(parseRoman('I'), 1);
assert.strictEqual(parseRoman('IV'), 4);
assert.strictEqual(parseRoman('IX'), 9);
assert.strictEqual(parseRoman('XIV'), 14);
assert.strictEqual(parseRoman('XC'), 90);
assert.strictEqual(parseRoman('MCMXCIV'), 1994);
for (const bad of ['IIII', 'VV', 'IC', 'IL', 'XM']) {
  let threw = false; try { parseRoman(bad); } catch (_) { threw = true; }
  assert.ok(threw, 'must reject ' + bad);
}
console.log('H7 ok');
