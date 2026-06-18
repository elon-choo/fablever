module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) for (const y of x) out.push(y); // BUG: only one level deep
    else out.push(x);
  }
  return out;
};
