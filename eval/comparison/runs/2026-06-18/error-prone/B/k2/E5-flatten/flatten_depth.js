module.exports = function flattenDepth(arr, depth) {
  if (depth === undefined) depth = 1;
  const result = [];
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) {
      result.push(...flattenDepth(item, depth - 1));
    } else {
      result.push(item);
    }
  }
  return result;
};
