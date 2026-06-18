function formatReport(rows, opts = {}) {
  // Rule 1: skip rows whose amount is null or undefined.
  let included = rows.filter(r => r.amount !== null && r.amount !== undefined);

  // Rule 2: sort by amount DESC, break ties by name ASC.
  included.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Rule 3: keep only the first opts.top rows when it is a positive number.
  if (typeof opts.top === 'number' && opts.top > 0) {
    included = included.slice(0, opts.top);
  }

  const lines = included.map(r => truncateName(r.name) + '  ' + formatAmount(r.amount));

  // Rule 8: append the TOTAL line over the included rows' amounts.
  const total = included.reduce((sum, r) => sum + r.amount, 0);
  lines.push('TOTAL' + '  ' + formatAmount(total));

  return lines.join('\n');
}

// Rule 7: names longer than 12 chars become first 11 chars + '…'.
function truncateName(name) {
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

// Rules 5 & 6: 2 decimals + thousands separators; negatives wrapped in parens with $ inside.
function formatAmount(n) {
  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = '$' + withSeparators + '.' + decPart;
  return negative ? '(' + body + ')' : body;
}

module.exports = formatReport;
