module.exports = function intersect(A, B) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i][0], B[j][0]);
    const end = Math.min(A[i][1], B[j][1]);
    if (start <= end) {
      result.push([start, end]);
    }
    // Advance the interval that ends first; it cannot intersect anything later.
    if (A[i][1] < B[j][1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
};
