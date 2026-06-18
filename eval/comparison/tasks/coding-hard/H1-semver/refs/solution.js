module.exports = function compare(a, b) {
  const parse = s => { const [c, p] = s.split('-'); return { n: c.split('.').map(Number), p: p ? p.split('.') : null }; };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] < B.n[i] ? -1 : 1;
  if (!A.p && !B.p) return 0;
  if (!A.p) return 1;          // no pre-release outranks a pre-release
  if (!B.p) return -1;
  const k = Math.min(A.p.length, B.p.length);
  for (let i = 0; i < k; i++) {
    const x = A.p[i], y = B.p[i], xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) { if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1; }
    else if (xn) return -1;
    else if (yn) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  if (A.p.length !== B.p.length) return A.p.length < B.p.length ? -1 : 1;
  return 0;
};
