module.exports = function slugify(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-'); // naive: misses diacritics, collapse, trim, symbols
};
