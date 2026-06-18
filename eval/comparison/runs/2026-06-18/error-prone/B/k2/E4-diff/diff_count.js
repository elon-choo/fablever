module.exports = function diff(a, b) {
  const count = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const countA = count(a);
  const countB = count(b);

  // Emit one entry per extra occurrence, ordered by first appearance in `source`.
  const surplus = (source, more, less) => {
    const out = [];
    const seen = new Set();
    for (const x of source) {
      if (seen.has(x)) continue;
      seen.add(x);
      const extra = (more.get(x) || 0) - (less.get(x) || 0);
      for (let i = 0; i < extra; i++) out.push(x);
    }
    return out;
  };

  return {
    added: surplus(b, countB, countA),
    removed: surplus(a, countA, countB),
  };
};
