module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) { return m.has(k) ? m.get(k) : undefined; }, // BUG: get does not refresh recency
    put(k, v) { if (m.has(k)) m.delete(k); m.set(k, v); if (m.size > cap) m.delete(m.keys().next().value); },
  };
};
