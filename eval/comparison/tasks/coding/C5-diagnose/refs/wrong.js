module.exports = function createCache(now) {
  now = now || (() => Date.now());
  const m = new Map();
  return {
    set(k, v, ttl) { m.set(k, { v, exp: now() + ttl }); },
    get(k) { const e = m.get(k); return e ? e.v : undefined; }, // never expires
  };
};
