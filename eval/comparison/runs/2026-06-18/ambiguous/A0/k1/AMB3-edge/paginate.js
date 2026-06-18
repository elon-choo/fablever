// Used by GET /items?page=&perPage=  (page is 1-based).
// QA filed bugs: page=0 returns the tail of the list, and a page past the end returns junk.
function paginate(items, page, perPage) {
  if (!Array.isArray(items)) return [];

  // Query-string params arrive as strings; coerce to integers and reject junk.
  page = Math.trunc(Number(page));
  perPage = Math.trunc(Number(perPage));
  if (!Number.isFinite(page) || !Number.isFinite(perPage) || perPage < 1) return [];

  // Clamp to the 1-based range so page<1 can't slice from the tail.
  if (page < 1) page = 1;

  const start = (page - 1) * perPage;
  // A page past the end is an empty page, not junk from a stray slice.
  if (start >= items.length) return [];

  return items.slice(start, start + perPage);
}

module.exports = paginate;
