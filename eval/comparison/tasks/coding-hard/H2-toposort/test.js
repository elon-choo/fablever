const assert = require('assert');
const topoSort = require('./toposort.js');
const nodes = ['d', 'a', 'c', 'b'];
const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']];
const order = topoSort(nodes, edges);
assert.deepStrictEqual([...order].sort(), ['a', 'b', 'c', 'd']);
const pos = {}; order.forEach((n, i) => pos[n] = i);
for (const [x, y] of edges) assert.ok(pos[x] < pos[y], x + ' before ' + y);
let threw = false;
try { topoSort(['x', 'y'], [['x', 'y'], ['y', 'x']]); } catch (_) { threw = true; }
assert.ok(threw, 'cycle must throw');
console.log('H2 ok');
