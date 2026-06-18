module.exports = function intersect(A, B) {
  const out = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]);
    if (lo < hi) out.push([lo, hi]); // BUG: strict, drops single-point touches
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return out;
};
