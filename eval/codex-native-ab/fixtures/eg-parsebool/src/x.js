'use strict';

// Parse a string into a boolean. "true"/"yes"/"1" => true (case-insensitive),
// everything else => false.
function parseBool(s) {
  const v = String(s).trim();
  return v === 'true' || v === 'yes' || v === '1';
}

module.exports = { parseBool };
