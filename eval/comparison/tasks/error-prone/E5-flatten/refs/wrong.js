module.exports = function flattenDepth(arr, depth = 1) {
  const out = [];
  for (const x of arr) { if (Array.isArray(x)) out.push(...flattenDepth(x, depth - 1)); else out.push(x); }
  return out; // BUG: no dep<1 base case -> ignores depth, flattens fully
};
