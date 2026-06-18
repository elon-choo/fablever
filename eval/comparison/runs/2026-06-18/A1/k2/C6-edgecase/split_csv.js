module.exports = function splitCsv(line) {
  return line.split(';'); // naive: breaks on quoted fields containing ';'
};
