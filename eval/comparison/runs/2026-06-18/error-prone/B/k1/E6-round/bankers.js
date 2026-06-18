module.exports = function round(x) {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  // Exactly halfway: round to the even neighbor.
  return floor % 2 === 0 ? floor : floor + 1;
};
