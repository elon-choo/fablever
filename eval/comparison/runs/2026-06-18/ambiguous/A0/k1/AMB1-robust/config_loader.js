const fs = require('fs');

// Loaded once at startup. Previously, if this threw, the whole process exited
// immediately — a missing file or a stray trailing comma took prod down and
// kept paging ops. Now we degrade gracefully: an unreadable or malformed config
// falls back to the supplied defaults and logs a warning instead of crashing.
function loadConfig(path, defaults = {}) {
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`loadConfig: config file not found at "${path}", using defaults`);
    } else {
      console.warn(`loadConfig: could not read config file at "${path}" (${err.message}), using defaults`);
    }
    return { ...defaults };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`loadConfig: config at "${path}" is not valid JSON (${err.message}), using defaults`);
    return { ...defaults };
  }

  // A valid JSON document can still be a non-object (null, number, array);
  // none of those are usable as a config, so fall back rather than merge.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`loadConfig: config at "${path}" is not a JSON object, using defaults`);
    return { ...defaults };
  }

  return { ...defaults, ...parsed };
}

module.exports = loadConfig;
