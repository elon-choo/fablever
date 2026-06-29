'use strict';
// Parses "k1=v1&k2=v2" into a plain object. Keys and values are URL-encoded.
function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split('&')) {
    const idx = pair.indexOf('=');
    const key = pair.slice(0, idx);
    const val = pair.slice(idx + 1);
    out[key] = val;
  }
  return out;
}
module.exports = { parseQuery };
