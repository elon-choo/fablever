module.exports = function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};
