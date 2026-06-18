// ORIGINAL
function original(items) {
  let subtotal = 0;
  for (let i = 0; i <= items.length; i++) {
    if (items[i]) subtotal += items[i].price * items[i].qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

// CANDIDATE NEW
function candidate(items) {
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item) subtotal += item.price * item.qty;
  }
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

const sparse = [];
sparse[2] = { price: 4, qty: 2 }; // holes at 0,1

const inputs = {
  "normal":            [{price:2,qty:3},{price:5,qty:1}],
  "empty":             [],
  "single qty 0":      [{price:7,qty:0}],
  "null/undef holes":  [{price:2,qty:3}, null, undefined, {price:1,qty:1}],
  "sparse array":      sparse,
  "falsy entries":     [0, false, "", {price:3,qty:3}],
  "missing fields":    [{price:5}, {qty:2}, {}],
  "string item":       ["abc", {price:1,qty:1}],
  "array-like object": Object.assign({length:2}, {0:{price:1,qty:2}, 1:{price:3,qty:4}}),
  "array-like @len truthy": Object.assign({length:1}, {0:{price:1,qty:1}, 1:{price:5,qty:5}}),
};

const key = (o) => JSON.stringify(o, (k, v) => (typeof v === "number" && Number.isNaN(v)) ? "NaN" : v);
let allMatch = true;
for (const name of Object.keys(inputs)) {
  const inp = inputs[name];
  let oStr, cStr;
  try { oStr = key(original(inp)); } catch (e) { oStr = "THROW(" + e.constructor.name + ")"; }
  try { cStr = key(candidate(inp)); } catch (e) { cStr = "THROW(" + e.constructor.name + ")"; }
  const match = oStr === cStr;
  if (!match) allMatch = false;
  console.log((match ? "OK  " : "DIFF") + " | " + name.padEnd(24) + " | orig=" + oStr + "  new=" + cStr);
}
console.log("\nALL MATCH:", allMatch);
