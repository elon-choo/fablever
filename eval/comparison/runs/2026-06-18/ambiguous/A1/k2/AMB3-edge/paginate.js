// Used by GET /items?page=&perPage=  (page is 1-based).
// Query params arrive as strings, so coerce to integers; invalid or out-of-range
// input yields an empty page rather than the tail of the list or a junk slice.
function paginate(items, page, perPage) {
  if (!Array.isArray(items)) return [];
  page = Math.trunc(Number(page));
  perPage = Math.trunc(Number(perPage));
  if (!Number.isInteger(page) || page < 1) return [];
  if (!Number.isInteger(perPage) || perPage < 1) return [];
  const start = (page - 1) * perPage;
  if (start >= items.length) return [];
  return items.slice(start, start + perPage);
}

module.exports = paginate;
