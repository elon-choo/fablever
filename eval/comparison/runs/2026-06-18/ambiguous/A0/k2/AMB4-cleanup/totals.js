// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
const TAX_RATE = 0.1;

function computeTotals(items) {
  const subtotal = items.reduce(
    (sum, item) => (item ? sum + item.price * item.qty : sum),
    0
  );
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
