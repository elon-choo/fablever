const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const basePath = path.resolve(base);
  const fullPath = path.resolve(basePath, userPath);

  const relativePath = path.relative(basePath, fullPath);
  if (relativePath.startsWith('..')) {
    throw new Error('Path traversal attack detected');
  }

  return fs.readFileSync(fullPath, 'utf8');
};
