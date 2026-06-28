'use strict';
// Already correct: clamp(5,0,10) === 5. There is no bug here.
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
module.exports = { clamp };
