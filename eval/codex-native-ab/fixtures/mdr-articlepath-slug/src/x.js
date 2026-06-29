'use strict';

const { slugify } = require('./legacy');

// Builds a canonical article path: /<section>/<slug>
function articlePath(section, words) {
  const slug = slugify(words);
  return '/' + section + slug;
}

module.exports = { articlePath };
