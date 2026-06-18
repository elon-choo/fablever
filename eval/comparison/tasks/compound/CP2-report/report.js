function formatReport(rows, opts = {}) {
  return rows.map(r => r.name + ': $' + r.amount).join('\n');
}
module.exports = formatReport;
