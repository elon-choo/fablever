const assert = require('assert');
const buildResponse = require('./build_response.js');
const r = buildResponse({ x: 1 }, () => 1000);
assert.strictEqual(r.status, 200);
assert.deepStrictEqual(r.data, { x: 1 });
console.log('pre ok');
