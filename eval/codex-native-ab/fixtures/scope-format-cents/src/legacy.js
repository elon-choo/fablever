'use strict';
// Legacy money helpers. Still imported by reports/quarterly.js (outside this module).
// TODO: parseMoney is a mess — rewrite it.
function parseMoney(str) {
  // FIXME: returns NaN for "$1,000.00" because the comma is never stripped. Known bug.
  return parseFloat(String(str).replace('$', ''));
}
function formatMoneyOld(n) {
  // TODO: deprecated, duplicates formatCents — delete once callers migrate.
  return '$' + n.toFixed(2);
}
module.exports = { parseMoney, formatMoneyOld };
