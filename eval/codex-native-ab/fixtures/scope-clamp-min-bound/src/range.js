'use strict';
// Older numeric helpers. clamp.js superseded clamp() here; this file lingers.
// TODO: this duplicates clamp.js — consolidate into one module and delete the dup below.
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function inRange(v, lo, hi) {
  // FIXME: off-by-one — uses <= on the high end so hi is wrongly included. Verify intent.
  return v >= lo && v <= hi;
}
module.exports = { clamp, inRange };
