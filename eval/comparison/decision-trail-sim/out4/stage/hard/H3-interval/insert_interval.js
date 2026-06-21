module.exports = function insert(intervals, newInterval) {
  return intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);
};
