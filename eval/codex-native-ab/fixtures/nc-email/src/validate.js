'use strict';
// Standard email check — already ACCEPTS plus-addressing (a+b@x.com). There is no bug here.
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }
module.exports = { isValidEmail };
