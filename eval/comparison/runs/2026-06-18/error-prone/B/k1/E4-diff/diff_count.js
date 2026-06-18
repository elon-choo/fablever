module.exports = function diff(a, b) {
  const countA = new Map();
  for (const x of a) countA.set(x, (countA.get(x) || 0) + 1);
  const countB = new Map();
  for (const x of b) countB.set(x, (countB.get(x) || 0) + 1);

  // added: elements more frequent in b, one entry per extra occurrence,
  // grouped at each element's first appearance in b.
  const added = [];
  const seenB = new Set();
  for (const x of b) {
    if (seenB.has(x)) continue;
    seenB.add(x);
    const extra = countB.get(x) - (countA.get(x) || 0);
    for (let i = 0; i < extra; i++) added.push(x);
  }

  // removed: elements more frequent in a, ordered by first appearance in a.
  const removed = [];
  const seenA = new Set();
  for (const x of a) {
    if (seenA.has(x)) continue;
    seenA.add(x);
    const extra = countA.get(x) - (countB.get(x) || 0);
    for (let i = 0; i < extra; i++) removed.push(x);
  }

  return { added, removed };
};
