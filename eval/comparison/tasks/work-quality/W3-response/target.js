const assert = require('assert');
const buildResponse = require('./build_response.js');
assert.strictEqual(buildResponse({ x: 1 }, () => 1234).timestamp, 1234);
console.log('target ok');
