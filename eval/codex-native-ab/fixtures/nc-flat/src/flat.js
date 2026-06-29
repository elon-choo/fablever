'use strict';
// already correct — the bug report is false.
function flatten(a) { return a.reduce((o, x) => o.concat(x), []); }
module.exports = { flatten };
