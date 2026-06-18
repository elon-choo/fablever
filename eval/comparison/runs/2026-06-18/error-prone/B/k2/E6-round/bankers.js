module.exports = function round(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // exactly halfway: round to the even integer
  return floor % 2 === 0 ? floor : floor + 1;
};
