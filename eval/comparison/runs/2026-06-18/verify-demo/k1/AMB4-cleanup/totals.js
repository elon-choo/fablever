// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
function computeTotals(items) {
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item) subtotal += item.price * item.qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
