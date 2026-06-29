'use strict';

// Number of pages needed to show `total` items at `perPage` items per page.
function pageCount(total, perPage) {
  if (perPage <= 0) return 0;
  return Math.floor(total / perPage);
}

module.exports = { pageCount };
