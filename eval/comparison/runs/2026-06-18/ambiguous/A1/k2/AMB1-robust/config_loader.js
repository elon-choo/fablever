const fs = require('fs');

// Loaded once at startup. A missing file or a stray trailing comma used to throw
// here and take the whole process down. Now we degrade gracefully: on any read or
// parse failure we warn and fall back to `defaults` instead of crashing prod.
function loadConfig(path, defaults = {}) {
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.warn(`loadConfig: could not read "${path}" (${err.code || err.message}); using defaults`);
    return defaults;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`loadConfig: invalid JSON in "${path}" (${err.message}); using defaults`);
    return defaults;
  }
}

module.exports = loadConfig;
