module.exports = function intersect(A, B) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]);
    const hi = Math.min(A[i][1], B[j][1]);
    if (lo <= hi) {
      result.push([lo, hi]);
    }
    // Advance the interval that ends first; the other may still
    // overlap with the next interval in the opposite list.
    if (A[i][1] < B[j][1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
};
