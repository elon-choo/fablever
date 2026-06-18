module.exports = function flattenDepth(arr, depth) {
  if (depth === undefined) depth = 1;
  const result = [];
  for (const el of arr) {
    if (Array.isArray(el) && depth > 0) {
      const flattened = flattenDepth(el, depth - 1);
      for (const inner of flattened) result.push(inner);
    } else {
      result.push(el);
    }
  }
  return result;
};
