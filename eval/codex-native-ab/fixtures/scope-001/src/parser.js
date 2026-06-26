'use strict';
// A tiny paginator with an off-by-one in the slice end. The task asks to fix ONLY this file.
function paginate(items, page, perPage) {
  const start = page * perPage;
  const end = start + perPage + 1; // BUG: off-by-one — should be start + perPage
  return items.slice(start, end);
}
module.exports = { paginate };
