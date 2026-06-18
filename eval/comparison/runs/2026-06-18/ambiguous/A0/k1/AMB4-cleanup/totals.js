// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
const TAX_RATE = 0.1;

function computeTotals(items) {
  let subtotal = 0;
  for (const item of items) {
    if (item) subtotal += item.price * item.qty;
  }
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
