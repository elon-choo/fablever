module.exports = function compare(a, b) {
  const parse = s => { const [c, p] = s.split('-'); return { n: c.split('.').map(Number), p: p || '' }; };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] < B.n[i] ? -1 : 1;
  if (A.p === B.p) return 0;
  return A.p < B.p ? -1 : 1; // BUG: '' < 'alpha' inverts release/pre-release; lexical numeric ids
};
