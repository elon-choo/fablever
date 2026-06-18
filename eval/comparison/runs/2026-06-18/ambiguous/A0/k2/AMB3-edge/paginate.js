// Used by GET /items?page=&perPage=  (page is 1-based).
// QA filed bugs: page=0 returns the tail of the list, and a page past the end returns junk.
function paginate(items, page, perPage) {
  if (!Array.isArray(items)) return [];

  // Coerce paging params to integers; reject anything that isn't a usable
  // positive value (NaN, Infinity, < 1, fractional input from query strings).
  page = Math.trunc(Number(page));
  perPage = Math.trunc(Number(perPage));
  if (!Number.isFinite(page) || page < 1) return [];
  if (!Number.isFinite(perPage) || perPage < 1) return [];

  const start = (page - 1) * perPage;
  // A page at or past the end has no items: return an empty page rather than
  // slicing from the tail (page=0/negative) or returning junk (page too high).
  if (start >= items.length) return [];

  return items.slice(start, start + perPage);
}

module.exports = paginate;
