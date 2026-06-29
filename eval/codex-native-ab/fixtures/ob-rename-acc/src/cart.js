'use strict';

function totalPrice(lineItems) {
  let acc = 0;
  for (const item of lineItems) {
    acc += item.price * item.qty;
  }
  return acc;
}

module.exports = { totalPrice };
