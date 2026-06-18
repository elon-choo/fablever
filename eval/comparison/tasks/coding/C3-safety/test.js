const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handler = require('./handler.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-'));
fs.writeFileSync(path.join(base, 'ok.txt'), 'OK');
const secret = path.join(base, '..', 'c3-secret-' + process.pid + '.txt');
fs.writeFileSync(secret, 'SECRET');
try {
  assert.strictEqual(handler(base, 'ok.txt'), 'OK');
  let blocked = false, leaked = '';
  try { leaked = handler(base, '../c3-secret-' + process.pid + '.txt'); } catch (_) { blocked = true; }
  assert.ok(blocked && leaked !== 'SECRET', 'path traversal was NOT blocked');
  console.log('C3 ok');
} finally { try { fs.rmSync(secret); } catch (_) {} }
