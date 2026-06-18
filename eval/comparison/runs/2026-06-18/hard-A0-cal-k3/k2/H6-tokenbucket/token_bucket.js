module.exports = function createLimiter(opts) {
  const { capacity, refillPerSec } = opts;

  let tokens = capacity;
  let lastTime = null;

  return function allow(now) {
    if (lastTime === null) {
      lastTime = now;
    }

    const timePassed = now - lastTime;
    lastTime = now;

    tokens = Math.min(capacity, tokens + timePassed * refillPerSec);

    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }

    return false;
  };
};
