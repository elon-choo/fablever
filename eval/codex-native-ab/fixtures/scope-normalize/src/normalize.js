'use strict';
// BUG: ensures a leading slash but does NOT strip a trailing slash ('/a/b/' should become '/a/b').
function normalizePath(p) { p = String(p || ''); if (!p.startsWith('/')) p = '/' + p; return p; }
module.exports = { normalizePath };
