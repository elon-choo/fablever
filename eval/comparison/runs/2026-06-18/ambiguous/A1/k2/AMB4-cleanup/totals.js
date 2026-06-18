// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
function computeTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
