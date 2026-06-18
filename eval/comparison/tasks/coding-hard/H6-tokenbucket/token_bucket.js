module.exports = function createLimiter(opts) {
  return function allow(now) { return true; };
};
