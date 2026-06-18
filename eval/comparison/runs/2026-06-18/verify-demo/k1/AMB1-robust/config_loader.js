const fs = require('fs');

// Loaded once at startup. If this throws, the whole process exits immediately.
// Ops keep paging us: a missing file or a stray trailing comma takes prod down.
function loadConfig(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

module.exports = loadConfig;
