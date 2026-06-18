module.exports = function round(x) {
  return Math.round(x); // BUG: 0.5->1, 2.5->3, and -0.5->0 vs -1.5->-1 (not half-even)
};
