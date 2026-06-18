module.exports = function createCache(now) {
  now = now || (() => Date.now());
  const m = new Map();
  return {
    set(k, v, ttl) { m.set(k, { v, exp: now() + ttl }); },
    get(k) { const e = m.get(k); if (!e) return undefined; if (now() >= e.exp) { m.delete(k); return undefined; } return e.v; },
  };
};
