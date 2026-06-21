module.exports = function compare(a, b) {
  const A = a.split('-')[0].split('.').map(Number);
  const B = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
  return 0;
};
