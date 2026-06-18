const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  if (path.isAbsolute(userPath)) throw new Error('forbidden'); // insufficient: blocks absolute, not ../
  return fs.readFileSync(path.join(base, userPath), 'utf8');
};
