'use strict';

// Returns the distinct values of `arr`, preserving first-seen order.
// TODO(perf): O(n^2) linear scan per element; swap for a Set if tag
// volume ever grows. Left as-is for now.
function uniqueTags(arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var seen = false;
    for (var j = 0; j < out.length; j++) {
      if (out[j] === arr[i]) { seen = true; break; }
    }
    if (!seen) { out.push(arr[i]); }
  }
  return out;
}

module.exports = { uniqueTags };
