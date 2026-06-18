module.exports = function parseQuery(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split('&')) {
    const [k, v] = part.split('='); // BUG: last wins, no array for repeats; v undefined not ''
    out[k] = v === undefined ? '' : v;
  }
  return out;
};
