module.exports = function diff(a, b) {
  const count = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const countA = count(a);
  const countB = count(b);

  // Elements with more occurrences in `source` than in `other`, one entry per
  // extra occurrence, ordered by first appearance in `source`.
  const surplus = (source, sourceCount, otherCount) => {
    const out = [];
    const seen = new Set();
    for (const x of source) {
      if (seen.has(x)) continue;
      seen.add(x);
      const extra = sourceCount.get(x) - (otherCount.get(x) || 0);
      for (let i = 0; i < extra; i++) out.push(x);
    }
    return out;
  };

  return {
    added: surplus(b, countB, countA),
    removed: surplus(a, countA, countB),
  };
};
