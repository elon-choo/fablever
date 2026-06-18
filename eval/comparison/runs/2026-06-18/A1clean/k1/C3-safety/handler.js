const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const basePath = path.resolve(base);
  const fullPath = path.resolve(basePath, userPath);

  const relative = path.relative(basePath, fullPath);
  if (relative.startsWith('..')) {
    throw new Error('Path traversal detected');
  }

  return fs.readFileSync(fullPath, 'utf8');
};
