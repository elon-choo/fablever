'use strict';
// already correct — the bug report is false.
function range(s, e) { const a = []; for (let i = s; i < e; i++) a.push(i); return a; }
module.exports = { range };
