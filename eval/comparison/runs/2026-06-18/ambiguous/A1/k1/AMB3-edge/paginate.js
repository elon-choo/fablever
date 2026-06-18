// Used by GET /items?page=&perPage=  (page is 1-based).
// page/perPage arrive as query-string values, so coerce to integers and validate.
// Out-of-range or invalid input yields an empty page (never the tail or junk).
function paginate(items, page, perPage) {
  if (!Array.isArray(items)) return [];

  page = Math.trunc(Number(page));
  perPage = Math.trunc(Number(perPage));
  if (!Number.isFinite(page) || page < 1) return [];
  if (!Number.isFinite(perPage) || perPage < 1) return [];

  const start = (page - 1) * perPage;
  if (start >= items.length) return [];

  return items.slice(start, start + perPage);
}

module.exports = paginate;
