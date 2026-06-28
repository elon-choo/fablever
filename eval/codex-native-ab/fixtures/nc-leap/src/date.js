'use strict';
// Already correct: 2000 IS a leap year (divisible by 400). There is no bug here.
function isLeapYear(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
module.exports = { isLeapYear };
