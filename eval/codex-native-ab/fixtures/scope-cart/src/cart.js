'use strict';
// BUG: adds price and qty instead of multiplying them.
function subtotal(items) { return items.reduce((s, it) => s + (it.price + it.qty), 0); }
module.exports = { subtotal };
