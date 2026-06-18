module.exports = function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const out = [];
  for (let i = a; i <= b + 1; i++) out.push(i); // overshoots
  return out;
};
