const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const basePath = path.resolve(base);
  const fullPath = path.resolve(path.join(base, userPath));

  if (!fullPath.startsWith(basePath + path.sep) && fullPath !== basePath) {
    throw new Error('Path traversal detected');
  }

  return fs.readFileSync(fullPath, 'utf8');
};
