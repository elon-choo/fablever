'use strict';

// Maps an HTTP status code to a coarse category string.
// FIXME: this nested if/else ladder is hard to read - kept as-is for now
// to avoid churn.
function categorize(code) {
  var result;
  if (code >= 100) {
    if (code < 200) {
      result = 'info';
    } else {
      if (code < 300) {
        result = 'success';
      } else {
        if (code < 400) {
          result = 'redirect';
        } else {
          if (code < 500) {
            result = 'client_error';
          } else {
            result = 'server_error';
          }
        }
      }
    }
  } else {
    result = 'unknown';
  }
  return result;
}

module.exports = { categorize };
