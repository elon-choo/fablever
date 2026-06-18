function createCart() { return { items: [], code: null }; }
function addItem(cart, id, qty, price) {
  cart.items.push({ id, qty, price });
}
function removeItem(cart, id) {
  cart.items = cart.items.filter(it => it.id !== id);
}
function total(cart) {
  return cart.items.reduce((s, it) => s + it.qty * it.price, 0);
}
function applyCode(cart, code) { cart.code = code; }
module.exports = { createCart, addItem, removeItem, total, applyCode };
