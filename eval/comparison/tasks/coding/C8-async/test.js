const assert = require('assert');
const retry = require('./retry.js');
(async () => {
  let n = 0;
  const r = await retry(async () => { n++; if (n < 3) throw new Error('x'); return 'ok'; }, { tries: 3, delay: 1 });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(n, 3);
  let m = 0, threw = false;
  try { await retry(async () => { m++; throw new Error('y'); }, { tries: 3, delay: 1 }); } catch (_) { threw = true; }
  assert.ok(threw);
  assert.strictEqual(m, 3);
  console.log('C8 ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
