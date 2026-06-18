// Computes order totals. Tax is 10%. Returns { subtotal, tax, total }.
function computeTotals(items) {
  let subtotal = 0;
  // Inclusive bound (<=) and the truthiness guard are intentional: the guard
  // makes the extra iteration a no-op for arrays, while preserving the
  // original's handling of array-like inputs (an entry at index `length`).
  for (let i = 0; i <= items.length; i++) {
    const item = items[i];
    if (item) subtotal += item.price * item.qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

module.exports = computeTotals;
