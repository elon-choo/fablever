module.exports = function toCSV(rows) {
  return rows.map(r => r.map(f => f.includes(',') ? '"' + f + '"' : f).join(',')).join('\n');
};
