const orig = require('./_orig');
const next = require('./_new');

function makeSparse() {
  const a = [];
  a[1] = { price: 2, qty: 2 };
  return a; // hole at index 0
}

// Proxy whose index getter returns a different object each read (non-idempotent)
function makeFlakyGetter() {
  let n = 0;
  return new Proxy({ length: 1 }, {
    get(t, k) {
      if (k === '0') { n++; return { price: n, qty: 1 }; }
      return t[k];
    },
  });
}

const cases = [
  ['empty', []],
  ['one item', [{ price: 2, qty: 3 }]],
  ['two items', [{ price: 2, qty: 3 }, { price: 5, qty: 1 }]],
  ['falsy elements mixed', [null, { price: 2, qty: 3 }, undefined, 0, false, '']],
  ['sparse hole at 0', makeSparse()],
  ['NaN price', [{ price: NaN, qty: 1 }]],
  ['empty object element', [{}]],
  ['string price/qty', [{ price: '2', qty: '3' }]],
  ['array-like, element AT index length', { length: 2, 0: { price: 1, qty: 1 }, 1: { price: 2, qty: 1 }, 2: { price: 99, qty: 1 } }],
  ['array-like, clean', { length: 2, 0: { price: 1, qty: 1 }, 1: { price: 2, qty: 1 } }],
  ['flaky non-idempotent getter', makeFlakyGetter()],
];

let allMatch = true;
for (const [name, input] of cases) {
  let a, b, ea = null, eb = null;
  try { a = JSON.stringify(orig(input)); } catch (e) { ea = e.message; }
  // fresh input for second call in case it was mutated/stateful
  let input2 = input;
  if (name === 'flaky non-idempotent getter') input2 = makeFlakyGetter();
  if (name === 'sparse hole at 0') input2 = makeSparse();
  try { b = JSON.stringify(next(input2)); } catch (e) { eb = e.message; }
  const match = a === b && ea === eb;
  if (!match) allMatch = false;
  console.log(`${match ? 'OK  ' : 'DIFF'} | ${name}`);
  console.log(`       orig: ${ea ? 'THROW ' + ea : a}`);
  console.log(`       new : ${eb ? 'THROW ' + eb : b}`);
}
console.log('\nALL MATCH:', allMatch);
