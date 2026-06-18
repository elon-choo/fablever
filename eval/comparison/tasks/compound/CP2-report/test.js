const assert = require('assert');
const formatReport = require('./report.js');
const rows = [
  { name: 'Alice', amount: 1234.5 },
  { name: 'Bob', amount: -50 },
  { name: 'Charlie Longname', amount: 1234.5 },
  { name: 'Dave', amount: null },
  { name: 'Eve', amount: 1000000 },
];
const expected = [
  'Eve  $1,000,000.00',
  'Alice  $1,234.50',
  'Charlie Lon…  $1,234.50',
  'Bob  ($50.00)',
  'TOTAL  $1,002,419.00',
].join('\n');
assert.strictEqual(formatReport(rows), expected);
// opts.top after sort
assert.strictEqual(formatReport(rows, { top: 2 }), ['Eve  $1,000,000.00','Alice  $1,234.50','TOTAL  $1,001,234.50'].join('\n'));
// all-negative total in parens
assert.strictEqual(formatReport([{name:'X',amount:-10},{name:'Y',amount:-5}]), ['Y  ($5.00)','X  ($10.00)','TOTAL  ($15.00)'].join('\n'));
console.log('CP2 ok');
