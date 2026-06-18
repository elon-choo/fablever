module.exports = function slugify(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-'); // off-the-shelf naive — fails >=2 cases
};
