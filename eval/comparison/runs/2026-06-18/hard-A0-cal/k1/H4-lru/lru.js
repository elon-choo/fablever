module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) {
      if (!m.has(k)) {
        return undefined;
      }
      const v = m.get(k);
      m.delete(k);
      m.set(k, v);
      return v;
    },
    put(k, v) {
      if (m.has(k)) {
        m.delete(k);
      }
      m.set(k, v);
      if (m.size > cap) {
        const firstKey = m.keys().next().value;
        m.delete(firstKey);
      }
    },
  };
};
