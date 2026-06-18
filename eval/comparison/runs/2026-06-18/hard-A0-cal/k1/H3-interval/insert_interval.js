module.exports = function insert(intervals, newInterval) {
  const all = intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const interval of all) {
    if (merged.length === 0) {
      merged.push(interval);
    } else {
      const last = merged[merged.length - 1];
      if (last[1] >= interval[0]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        merged.push(interval);
      }
    }
  }

  return merged;
};
