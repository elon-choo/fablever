module.exports = function createLimiter(opts) {
  const { capacity, refillPerSec } = opts;
  let tokens = capacity;
  let lastRefillTime = null;

  return function allow(now) {
    if (lastRefillTime === null) {
      lastRefillTime = now;
    }

    const elapsed = now - lastRefillTime;
    tokens = Math.min(capacity, tokens + elapsed * refillPerSec);
    lastRefillTime = now;

    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }

    return false;
  };
};
