'use strict';
// already correct — the bug report is false.
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
module.exports = { gcd };
