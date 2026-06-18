function formatReport(rows, opts = {}) {
  function formatAmount(amount) {
    const negative = amount < 0;
    const fixed = Math.abs(amount).toFixed(2);
    const dot = fixed.indexOf('.');
    const intPart = fixed.slice(0, dot);
    const decPart = fixed.slice(dot + 1);
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const core = '$' + withSep + '.' + decPart;
    return negative ? '(' + core + ')' : core;
  }

  const included = rows.filter(r => r.amount !== null && r.amount !== undefined);

  included.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  let kept = included;
  if (typeof opts.top === 'number' && opts.top > 0) {
    kept = included.slice(0, opts.top);
  }

  const lines = kept.map(r => {
    const name = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
    return name + '  ' + formatAmount(r.amount);
  });

  const total = kept.reduce((sum, r) => sum + r.amount, 0);
  lines.push('TOTAL' + '  ' + formatAmount(total));

  return lines.join('\n');
}
module.exports = formatReport;
