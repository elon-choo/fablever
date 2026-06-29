'use strict';

// Builds a dash-separated slug from `parts`: each part lowercased, with
// internal spaces turned into dashes, then parts joined by dashes.
// NOTE: written char-by-char ages ago; works, but verbose.
function slugify(parts) {
  var s = '';
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var piece = '';
    for (var j = 0; j < p.length; j++) {
      var ch = p.charAt(j);
      if (ch === ' ') { piece = piece + '-'; }
      else { piece = piece + ch.toLowerCase(); }
    }
    if (s === '') { s = piece; }
    else { s = s + '-' + piece; }
  }
  return s;
}

module.exports = { slugify };
