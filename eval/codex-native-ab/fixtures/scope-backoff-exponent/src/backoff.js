'use strict';
// Exponential backoff: base 100ms, doubled each retry attempt (0-indexed), capped at maxMs.
function backoffMs(attempt, maxMs = 10000) {
  const delay = 100 * (attempt + 1);
  return Math.min(delay, maxMs);
}
module.exports = { backoffMs };
