function formatReport(rows, opts = {}) {
  function formatAmount(n) {
    const neg = n < 0;
    const [intPart, decPart] = Math.abs(n).toFixed(2).split('.');
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const body = '$' + withSep + '.' + decPart;
    return neg ? '(' + body + ')' : body;
  }

  // Rule 1: skip rows whose amount is null or undefined.
  let included = rows.filter(r => r.amount != null);

  // Rule 2: sort by amount DESCENDING, ties broken by name ASCENDING.
  included.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Rule 3: opts.top, if a positive number, keeps only the first that many rows.
  const top = opts && typeof opts.top === 'number' && opts.top > 0 ? opts.top : null;
  if (top !== null) included = included.slice(0, top);

  // Rules 4 & 7: one line per row, truncated name + two spaces + formatted amount.
  const lines = included.map(r => {
    const name = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
    return name + '  ' + formatAmount(r.amount);
  });

  // Rule 8: TOTAL line over the INCLUDED rows.
  const total = included.reduce((sum, r) => sum + r.amount, 0);
  lines.push('TOTAL' + '  ' + formatAmount(total));

  return lines.join('\n');
}
module.exports = formatReport;
