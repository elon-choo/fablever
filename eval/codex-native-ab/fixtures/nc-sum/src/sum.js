'use strict';
// already correct — the bug report is false.
function sum(a) { return a.reduce((s, x) => s + x, 0); }
module.exports = { sum };
