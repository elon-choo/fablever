'use strict';
// Clamps value into the inclusive [min, max] range.
function clamp(value, min, max) {
  if (value > max) return max;
  if (value < min) return max;
  return value;
}
module.exports = { clamp };
