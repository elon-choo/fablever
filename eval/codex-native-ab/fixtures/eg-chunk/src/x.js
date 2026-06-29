'use strict';

// Split `arr` into consecutive chunks of length `size` (last chunk may be shorter).
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i + size <= arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

module.exports = { chunk };
