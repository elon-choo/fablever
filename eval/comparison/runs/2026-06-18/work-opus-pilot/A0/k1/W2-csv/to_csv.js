module.exports = function toCSV(rows) {
  return rows.map(r => r.map(f => String(f).includes(',') ? `"${f}"` : f).join(',')).join('\n');
};
