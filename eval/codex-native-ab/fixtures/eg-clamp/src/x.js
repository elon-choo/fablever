'use strict';

// Clamp n into the inclusive range [lo, hi].
function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return n;
  return n;
}

module.exports = { clamp };
