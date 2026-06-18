const fs = require('fs');

// Loaded once at startup. Historically, if this threw, the whole process exited
// immediately — a missing file or a stray trailing comma would take prod down and
// page ops. loadConfig now degrades gracefully: on any failure it logs the cause and
// returns the supplied defaults (an empty object by default) instead of throwing.
function loadConfig(path, defaults = {}) {
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.error(
      `loadConfig: could not read config file "${path}": ${err.message}. ` +
      `Falling back to defaults.`
    );
    return { ...defaults };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      `loadConfig: config file "${path}" is not valid JSON: ${err.message}. ` +
      `Falling back to defaults.`
    );
    return { ...defaults };
  }

  // Valid JSON can still be a non-object (null, a number, a string, an array).
  // Config is expected to be a key/value object; treat anything else as misconfigured.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(
      `loadConfig: config file "${path}" did not contain a JSON object. ` +
      `Falling back to defaults.`
    );
    return { ...defaults };
  }

  // Layer the file over the defaults so missing keys still resolve to safe values.
  return { ...defaults, ...parsed };
}

module.exports = loadConfig;
