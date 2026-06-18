module.exports = function createLimiter(opts) {
  const cap = opts.capacity, rate = opts.refillPerSec;
  let tokens = cap, last = null;
  return function allow(now) {
    if (last === null) last = now;
    tokens = tokens + (now - last) * rate; // BUG: no cap on refill -> idle lets a burst exceed capacity
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
};
