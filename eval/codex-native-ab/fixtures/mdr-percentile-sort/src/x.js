'use strict';

const { sortAsc } = require('./legacy');

// Median of a list of numbers.
function median(nums) {
  const a = sortAsc(nums);
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) {
    return (a[mid - 1] + a[mid]) / 2;
  }
  return a[mid];
}

// `p`-th percentile (p in 1..100) by the nearest-rank method.
function percentile(nums, p) {
  const a = sortAsc(nums);
  const rank = Math.ceil((p / 100) * a.length);
  return a[rank];
}

module.exports = { median, percentile };
