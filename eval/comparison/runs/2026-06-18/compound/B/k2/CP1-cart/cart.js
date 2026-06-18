function createCart() { return { items: [], code: null }; }
function addItem(cart, id, qty, price) {
  const existing = cart.items.find(it => it.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({ id, qty, price });
  }
}
function setQty(cart, id, qty) {
  const existing = cart.items.find(it => it.id === id);
  if (!existing) return;
  if (qty <= 0) {
    cart.items = cart.items.filter(it => it.id !== id);
  } else {
    existing.qty = qty;
  }
}
function removeItem(cart, id) {
  cart.items = cart.items.filter(it => it.id !== id);
}
function total(cart) {
  let sum = cart.items.reduce((s, it) => s + it.qty * it.price, 0);
  if (cart.code === 'SAVE10') sum *= 0.9;
  return Math.round(sum * 100) / 100;
}
function applyCode(cart, code) { cart.code = code; }
module.exports = { createCart, addItem, removeItem, setQty, total, applyCode };
