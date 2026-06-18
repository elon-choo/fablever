module.exports = function insert(intervals, newInterval) {
  const all = intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv.slice());
  }
  return out;
};
