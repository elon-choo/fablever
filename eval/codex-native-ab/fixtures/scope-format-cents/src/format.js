'use strict';
// Formats an integer number of cents into a "$D.CC" string.
function formatCents(cents) {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return '$' + dollars + '.' + remainder;
}
module.exports = { formatCents };
