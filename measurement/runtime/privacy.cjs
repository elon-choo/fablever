'use strict';
// measurement/runtime/privacy.cjs — local salt + one-way anonymization for the measurement ledger.
//
// The ledger must never hold a raw session id, a raw cwd, a prompt, an assistant message, a command, or a
// tool output. Identifiers that we DO need to join rows (which session, which project) are stored only as
// HMAC(salt, value) digests: stable enough to group a session's events, one-way so the raw value cannot be
// recovered from the ledger. The salt is a 32-byte random file written 0600 under the measurement home and
// never leaves the machine. Zero dependencies.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read the campaign-local salt, creating it once (0600) if absent. Handles the concurrent-create race
// (two hooks firing at once): if our exclusive create loses, we read the winner's salt.
function readOrCreateSalt(baseDir) {
  const file = path.join(baseDir, 'measurement-salt');
  try { return fs.readFileSync(file); } catch (_) { /* not yet created */ }
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch (_) {}
  const salt = crypto.randomBytes(32);
  try {
    const fd = fs.openSync(file, 'wx', 0o600); // wx = fail if it already exists
    try { fs.writeFileSync(fd, salt); } finally { fs.closeSync(fd); }
    return salt;
  } catch (_) {
    // Lost the race (EEXIST) or could not write — prefer whatever is on disk so all hooks share one salt.
    try { return fs.readFileSync(file); } catch (_) { return salt; }
  }
}

// One-way, prefixed, truncated digest. Same (value, salt) → same id; raw value is not recoverable.
function anonId(prefix, value, salt) {
  const digest = crypto.createHmac('sha256', salt).update(String(value || '')).digest('hex');
  return `${prefix}_${digest.slice(0, 24)}`;
}

module.exports = { readOrCreateSalt, anonId };
