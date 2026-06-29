'use strict';

const { uniqueTags } = require('./legacy');

// Returns the first `limit` distinct tags (in first-seen order)
// across all records.
function topTags(records, limit) {
  const all = [];
  for (const r of records) {
    for (const t of r.tags) { all.push(t); }
  }
  const distinct = uniqueTags(all);
  return distinct.slice(0, limit - 1);
}

module.exports = { topTags };
