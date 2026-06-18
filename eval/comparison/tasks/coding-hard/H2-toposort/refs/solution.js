module.exports = function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0]));
  const adj = new Map(nodes.map(n => [n, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); indeg.set(b, indeg.get(b) + 1); }
  let q = nodes.filter(n => indeg.get(n) === 0).sort();
  const out = [];
  while (q.length) {
    const n = q.shift(); out.push(n);
    for (const m of adj.get(n)) { indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) q.push(m); }
    q.sort();
  }
  if (out.length !== nodes.length) throw new Error('cycle');
  return out;
};
