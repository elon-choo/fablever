const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const p = path.join(base, userPath); // VULN: no traversal check
  return fs.readFileSync(p, 'utf8');
};
