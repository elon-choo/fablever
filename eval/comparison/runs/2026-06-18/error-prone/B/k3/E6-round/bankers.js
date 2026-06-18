module.exports = function round(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  // exactly halfway: round to the even neighbor
  return f % 2 === 0 ? f : f + 1;
};
