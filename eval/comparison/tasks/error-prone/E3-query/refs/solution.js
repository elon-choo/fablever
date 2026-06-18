module.exports = function parseQuery(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split('&')) {
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    if (k in out) { if (Array.isArray(out[k])) out[k].push(v); else out[k] = [out[k], v]; }
    else out[k] = v;
  }
  return out;
};
