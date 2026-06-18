// Original logic, inlined verbatim from the pre-edit totals.js.
function orig(items) {
  let subtotal = 0;
  for (let i = 0; i <= items.length; i++) {
    if (items[i]) subtotal += items[i].price * items[i].qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

// My edited version.
const next = require('./totals.js');

function makeSparse() {
  const a = [];
  a[1] = { price: 2, qty: 2 }; // hole at index 0
  return a;
}

// Proxy whose index getter returns a different object on each read (non-idempotent).
function makeFlaky() {
  let n = 0;
  return new Proxy({ length: 1 }, {
    get(t, k) {
      if (k === '0') { n++; return { price: n, qty: 1 }; }
      return t[k];
    },
  });
}

const cases = [
  ['empty array', () => []],
  ['one item', () => [{ price: 2, qty: 3 }]],
  ['two items', () => [{ price: 2, qty: 3 }, { price: 5, qty: 1 }]],
  ['falsy elements mixed', () => [null, { price: 2, qty: 3 }, undefined, 0, false, '']],
  ['sparse hole at 0', makeSparse],
  ['NaN price', () => [{ price: NaN, qty: 1 }]],
  ['empty object element', () => [{}]],
  ['string price/qty (coercion)', () => [{ price: '2', qty: '3' }]],
  ['array-like clean', () => ({ length: 2, 0: { price: 1, qty: 1 }, 1: { price: 2, qty: 1 } })],
  ['array-like w/ entry AT index length', () => ({ length: 2, 0: { price: 1, qty: 1 }, 1: { price: 2, qty: 1 }, 2: { price: 99, qty: 1 } })],
  ['non-idempotent getter (Proxy)', makeFlaky],
];

let allMatch = true;
for (const [name, make] of cases) {
  let a, b, ea = null, eb = null;
  try { a = JSON.stringify(orig(make())); } catch (e) { ea = e.message; }
  try { b = JSON.stringify(next(make())); } catch (e) { eb = e.message; }
  const match = a === b && ea === eb;
  if (!match) allMatch = false;
  console.log(`${match ? 'OK  ' : 'DIFF'} | ${name}`);
  console.log(`       orig: ${ea ? 'THROW ' + ea : a}`);
  console.log(`       new : ${eb ? 'THROW ' + eb : b}`);
}
console.log('\nALL MATCH:', allMatch);
