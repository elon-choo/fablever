module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) out.push(...flatten(x));
    else out.push(x);
  }
  return out;
};
