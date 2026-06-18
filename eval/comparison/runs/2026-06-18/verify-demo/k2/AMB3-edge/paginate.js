// Used by GET /items?page=&perPage=  (page is 1-based).
// QA filed bugs: page=0 returns the tail of the list, and a page past the end returns junk.
function paginate(items, page, perPage) {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

module.exports = paginate;
