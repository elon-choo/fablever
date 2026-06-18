function computeTotals(items) {
  let subtotal = 0;
  for (let i = 0; i <= items.length; i++) {
    if (items[i]) subtotal += items[i].price * items[i].qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}
module.exports = computeTotals;
