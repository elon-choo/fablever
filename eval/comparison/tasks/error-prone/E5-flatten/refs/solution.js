module.exports = function flattenDepth(arr, depth = 1) {
  if (depth < 1) return arr.slice();
  const out = [];
  for (const x of arr) { if (Array.isArray(x)) out.push(...flattenDepth(x, depth - 1)); else out.push(x); }
  return out;
};
