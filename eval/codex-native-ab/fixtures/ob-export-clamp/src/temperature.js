'use strict';

const ABSOLUTE_ZERO_C = -273.15;

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

function toFahrenheit(celsius) {
  const safe = clamp(celsius, ABSOLUTE_ZERO_C, Number.POSITIVE_INFINITY);
  return safe * 9 / 5 + 32;
}

module.exports = { toFahrenheit };
