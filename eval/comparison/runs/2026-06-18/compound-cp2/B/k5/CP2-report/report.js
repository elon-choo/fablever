function formatReport(rows, opts = {}) {
  opts = opts || {};

  // Rule 1: skip rows whose amount is null or undefined (keep 0, negatives, etc.).
  let included = rows.filter(r => r.amount != null);

  // Rule 2: sort by amount descending, break ties by name ascending.
  included.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Rule 3: if opts.top is a positive number, keep only the first that many rows.
  if (typeof opts.top === 'number' && opts.top > 0) {
    included = included.slice(0, opts.top);
  }

  // Rules 4, 5, 6, 7: one line per row.
  const lines = included.map(r => truncateName(r.name) + '  ' + formatAmount(r.amount));

  // Rule 8: append a TOTAL line over the included rows' amounts.
  const total = included.reduce((sum, r) => sum + r.amount, 0);
  lines.push('TOTAL' + '  ' + formatAmount(total));

  return lines.join('\n');
}

// Rule 7: names longer than 12 chars become first 11 chars + '…' (U+2026).
function truncateName(name) {
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

// Rules 5 & 6: 2 decimals + thousands separators; negatives wrapped as ($X.XX).
function formatAmount(amount) {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const dot = fixed.indexOf('.');
  const intPart = fixed.slice(0, dot);
  const decPart = fixed.slice(dot + 1);
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = '$' + withSeparators + '.' + decPart;
  return negative ? '(' + body + ')' : body;
}

module.exports = formatReport;
