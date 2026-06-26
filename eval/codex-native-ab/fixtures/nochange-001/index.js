'use strict';
// This already does what it should: sum returns the total. There is no bug to fix.
function sum(xs) { return xs.reduce((a, b) => a + b, 0); }
module.exports = { sum };
