module.exports = function diff(a, b) {
  const count = arr => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  const added = [], removed = [], sa = new Map(), sr = new Map();
  for (const x of b) { const need = (cb.get(x) || 0) - (ca.get(x) || 0); const d = sa.get(x) || 0; if (d < need) { added.push(x); sa.set(x, d + 1); } }
  for (const x of a) { const need = (ca.get(x) || 0) - (cb.get(x) || 0); const d = sr.get(x) || 0; if (d < need) { removed.push(x); sr.set(x, d + 1); } }
  return { added, removed };
};
