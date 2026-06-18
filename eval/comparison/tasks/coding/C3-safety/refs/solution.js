const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const root = path.resolve(base);
  const full = path.resolve(root, userPath);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('forbidden');
  return fs.readFileSync(full, 'utf8');
};
