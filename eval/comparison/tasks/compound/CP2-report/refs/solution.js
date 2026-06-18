function fmtAmt(n) {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '($' + s + ')' : '$' + s;
}
function formatReport(rows, opts = {}) {
  let rs = rows.filter(r => r.amount !== null && r.amount !== undefined);
  rs = rs.slice().sort((a, b) => b.amount - a.amount || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (opts.top > 0) rs = rs.slice(0, opts.top);
  const lines = rs.map(r => {
    const name = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
    return name + '  ' + fmtAmt(r.amount);
  });
  const sum = rs.reduce((s, r) => s + r.amount, 0);
  lines.push('TOTAL  ' + fmtAmt(sum));
  return lines.join('\n');
}
module.exports = formatReport;
