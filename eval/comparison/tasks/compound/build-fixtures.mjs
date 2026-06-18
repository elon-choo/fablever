// build-fixtures.mjs (COMPOUND axis) — multiple INTERACTING changes to a larger module + a full regression
// suite, no breaking existing behavior. This is the regime where single-pass plain Opus plausibly slips
// (miss one requirement / break one test), giving headroom for a plan+verify PROCESS to win. Oracle covers
// existing behavior AND every new requirement AND edge cases.
//   node build-fixtures.mjs / verify / stage <dir> / score <dir>
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'CP1-cart': {
    target: 'cart.js',
    prompt: `In cart.js make THREE changes without breaking any existing behavior:
1. addItem(cart, id, qty, price) on an id ALREADY in the cart must ADD to the existing quantity and keep the ORIGINAL price (no duplicate line).
2. Add setQty(cart, id, qty): set that item's quantity; if qty <= 0 remove the item entirely; if the id is not present do nothing. Export it.
3. Make total(cart) apply a 10% discount to the whole cart when the active code (set via applyCode) is exactly 'SAVE10' (any other code or null = no discount), and round the final total to 2 decimals.`,
    stub: `function createCart() { return { items: [], code: null }; }
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
`,
    solution: `function createCart() { return { items: [], code: null }; }
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
`,
    test: `const assert = require('assert');
const { createCart, addItem, removeItem, setQty, total, applyCode } = require('./cart.js');
// existing behavior preserved
let c = createCart();
addItem(c, 'a', 2, 10); addItem(c, 'b', 1, 5);
assert.strictEqual(total(c), 25);
removeItem(c, 'b'); assert.strictEqual(total(c), 20);
// req1: merge same id, keep original price
c = createCart(); addItem(c, 'a', 2, 10); addItem(c, 'a', 3, 999);
assert.strictEqual(c.items.length, 1, 'merge duplicate id');
assert.strictEqual(c.items[0].qty, 5); assert.strictEqual(c.items[0].price, 10);
// req2: setQty
c = createCart(); addItem(c, 'a', 2, 10);
setQty(c, 'a', 5); assert.strictEqual(c.items[0].qty, 5);
setQty(c, 'a', 0); assert.strictEqual(c.items.length, 0, 'qty<=0 removes');
setQty(c, 'nope', 3); assert.strictEqual(c.items.length, 0, 'unknown id no-op');
// req3: discount + rounding
c = createCart(); addItem(c, 'a', 3, 3.33); // raw 9.99
assert.strictEqual(total(c), 9.99);
applyCode(c, 'SAVE10'); assert.strictEqual(total(c), 8.99); // 9.99*0.9=8.991 -> 8.99
applyCode(c, 'OTHER'); assert.strictEqual(total(c), 9.99);
console.log('CP1 ok');
`,
  },
};

const runTest = dir => spawnSync(process.execPath, ['test.js'], { cwd: dir, encoding: 'utf8' });
function writeTree() {
  for (const [id, t] of Object.entries(TASKS)) {
    const dir = path.join(HERE, id); fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(dir, t.target), t.stub); fs.writeFileSync(path.join(dir, 'test.js'), t.test);
    fs.writeFileSync(path.join(dir, 'refs', 'solution.js'), t.solution);
  } console.log('wrote ' + Object.keys(TASKS).length);
}
function verify() {
  let ok = true;
  for (const [id, t] of Object.entries(TASKS)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-')); fs.writeFileSync(path.join(tmp, 'test.js'), t.test);
    const run = s => { fs.writeFileSync(path.join(tmp, t.target), s); return runTest(tmp).status === 0; };
    const st = run(t.stub), so = run(t.solution); fs.rmSync(tmp, { recursive: true, force: true });
    const o = !st && so; ok = ok && o; console.log(`${o ? 'PASS' : 'FAIL'}  ${id}  [stub fails:${!st} | solution passes:${so}]`);
  } console.log(ok ? 'SOUND' : 'UNSOUND'); return ok;
}
function stage(d) { for (const [id, t] of Object.entries(TASKS)) { const dd = path.join(d, id); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, t.target), t.stub); fs.writeFileSync(path.join(dd, 'PROMPT.txt'), t.prompt + '\n'); } console.log('staged'); }
function score(md) { const rows = []; for (const [id, t] of Object.entries(TASKS)) { let p = false; try { const src = fs.readFileSync(path.join(md, id, t.target), 'utf8'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-')); fs.writeFileSync(path.join(tmp, 'test.js'), t.test); fs.writeFileSync(path.join(tmp, t.target), src); p = runTest(tmp).status === 0; fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} rows.push({ id, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${id}`); } console.log(`score: ${rows.filter(r => r.p).length}/${rows.length}`); return rows; }
const m = process.argv[2] || 'all';
if (m === 'verify') process.exit(verify() ? 0 : 1);
if (m === 'stage') { stage(process.argv[3]); process.exit(0); }
if (m === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree(); process.exit(verify() ? 0 : 1);
