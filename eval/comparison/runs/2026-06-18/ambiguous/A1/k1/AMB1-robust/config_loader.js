const fs = require('fs');

// Loaded once at startup. A missing file or a stray trailing comma used to
// throw and take the whole process down. loadConfig now fails with a clear,
// contextual error so ops can see exactly what broke, and — when a fallback
// is supplied — returns it instead of crashing.
//
// Backward compatible: called with a path alone it still returns the parsed
// config and still throws on failure, only now with a message that names the
// file and the underlying cause.
function loadConfig(path, fallback) {
  const hasFallback = arguments.length > 1;

  const fail = (reason, cause) => {
    if (hasFallback) {
      console.warn(`loadConfig: ${reason} — using fallback config`);
      return fallback;
    }
    const err = new Error(`loadConfig: ${reason}`);
    if (cause) err.cause = cause;
    throw err;
  };

  if (typeof path !== 'string' || path.trim() === '') {
    return fail(`expected a non-empty file path string, got ${typeof path}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (cause) {
    const reason = cause.code === 'ENOENT'
      ? `config file not found at "${path}"`
      : `could not read config file "${path}": ${cause.message}`;
    return fail(reason, cause);
  }

  try {
    return JSON.parse(raw);
  } catch (cause) {
    return fail(`config file "${path}" is not valid JSON: ${cause.message}`, cause);
  }
}

module.exports = loadConfig;
