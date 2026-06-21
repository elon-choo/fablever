module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) { return m.has(k) ? m.get(k) : undefined; },
    put(k, v) { m.set(k, v); },
  };
};
