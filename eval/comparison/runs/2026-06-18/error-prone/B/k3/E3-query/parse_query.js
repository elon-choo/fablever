module.exports = function parseQuery(s) {
  const groups = new Map();
  if (s) {
    for (const part of s.split('&')) {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : part.slice(eq + 1);
      if (groups.has(key)) groups.get(key).push(value);
      else groups.set(key, [value]);
    }
  }
  const result = {};
  for (const [key, vals] of groups) {
    result[key] = vals.length > 1 ? vals : vals[0];
  }
  return result;
};
