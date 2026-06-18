module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) {
      for (const y of x) {
        if (Array.isArray(y)) for (const z of y) out.push(z); // only two levels
        else out.push(y);
      }
    } else out.push(x);
  }
  return out;
};
