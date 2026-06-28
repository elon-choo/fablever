'use strict';
function fetchUser(id, opts) {
  const timeout = (opts && opts.timeout) || 3000;
  return { id, timeout };
}
module.exports = { fetchUser };
