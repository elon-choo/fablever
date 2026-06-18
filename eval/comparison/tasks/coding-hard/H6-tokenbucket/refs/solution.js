module.exports = function createLimiter(opts) {
  const cap = opts.capacity, rate = opts.refillPerSec;
  let tokens = cap, last = null;
  return function allow(now) {
    if (last === null) last = now;
    tokens = Math.min(cap, tokens + (now - last) * rate);
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
};
