'use strict';

function buildIndex(records) {
  const index = {};
  for (const r of records) {
    index[r.id] = r;
  }
  return index;
}

function lookup(index, id) {
  return index[id];
}

module.exports = { buildIndex, lookup };
