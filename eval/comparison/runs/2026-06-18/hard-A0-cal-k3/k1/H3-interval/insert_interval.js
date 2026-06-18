module.exports = function insert(intervals, newInterval) {
  const all = intervals.concat([newInterval]);

  if (all.length === 0) return [];

  all.sort((a, b) => a[0] - b[0]);

  const merged = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const current = all[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
};
