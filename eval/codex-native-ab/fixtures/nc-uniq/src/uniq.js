'use strict';
// already correct — the bug report is false.
function uniq(a) { const seen = new Set(); const out = []; for (const x of a) { if (!seen.has(x)) { seen.add(x); out.push(x); } } return out; }
module.exports = { uniq };
