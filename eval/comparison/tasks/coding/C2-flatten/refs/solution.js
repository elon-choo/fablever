module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) for (const y of flatten(x)) out.push(y);
    else out.push(x);
  }
  return out;
};
