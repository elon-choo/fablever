'use strict';

function cartTotal(items, discountPercent) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }
  const discount = subtotal * (discountPercent / 100);
  return Math.round((subtotal - discount) * 100) / 100;
}

module.exports = { cartTotal };
