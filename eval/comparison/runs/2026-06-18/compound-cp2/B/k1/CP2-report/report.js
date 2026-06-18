function formatReport(rows, opts = {}) {
  // Rule 1: skip rows whose amount is null or undefined.
  let included = rows.filter(r => r.amount !== null && r.amount !== undefined);

  // Rule 2: sort by amount DESCENDING, tie-break by name ASCENDING.
  included.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Rule 3: if opts.top is a positive number, keep only the first that many rows.
  if (typeof opts.top === 'number' && opts.top > 0) {
    included = included.slice(0, opts.top);
  }

  const lines = included.map(r => truncateName(r.name) + '  ' + formatAmount(r.amount));

  // Rule 8: append a TOTAL line summing the INCLUDED rows' amounts.
  const total = included.reduce((sum, r) => sum + r.amount, 0);
  lines.push('TOTAL' + '  ' + formatAmount(total));

  return lines.join('\n');
}

// Rule 7: truncate names longer than 12 chars to first 11 chars + '…'.
function truncateName(name) {
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

// Rules 5 & 6: 2 decimals + thousands separators; negatives in parens, $ inside.
function formatAmount(amount) {
  const negative = amount < 0;
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = '$' + withSeparators + '.' + decPart;
  return negative ? '(' + formatted + ')' : formatted;
}

module.exports = formatReport;
