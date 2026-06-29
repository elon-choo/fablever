'use strict';

function success(data) {
  return { data, error: null };
}

function failure(message) {
  return { data: null, error: message };
}

module.exports = { success, failure };
