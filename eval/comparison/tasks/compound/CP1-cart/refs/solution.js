function createCart() { return { items: [], code: null }; }
function addItem(cart, id, qty, price) {
  const ex = cart.items.find(it => it.id === id);
  if (ex) ex.qty += qty; else cart.items.push({ id, qty, price });
}
function removeItem(cart, id) {
  cart.items = cart.items.filter(it => it.id !== id);
}
function setQty(cart, id, qty) {
  const ex = cart.items.find(it => it.id === id);
  if (!ex) return;
  if (qty <= 0) removeItem(cart, id); else ex.qty = qty;
}
function total(cart) {
  const raw = cart.items.reduce((s, it) => s + it.qty * it.price, 0);
  const final = cart.code === 'SAVE10' ? raw * 0.9 : raw;
  return Math.round(final * 100) / 100;
}
function applyCode(cart, code) { cart.code = code; }
module.exports = { createCart, addItem, removeItem, setQty, total, applyCode };
