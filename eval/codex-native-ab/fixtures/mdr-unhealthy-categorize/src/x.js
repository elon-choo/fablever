'use strict';

const { categorize } = require('./legacy');

// Counts responses by category.
function tally(codes) {
  const counts = {};
  for (const c of codes) {
    const cat = categorize(c);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

// True when the error rate (client + server errors) over all responses
// exceeds `threshold` (a fraction in 0..1).
function isUnhealthy(codes, threshold) {
  const counts = tally(codes);
  const errors = counts.server_error || 0;
  return errors / codes.length > threshold;
}

module.exports = { tally, isUnhealthy };
