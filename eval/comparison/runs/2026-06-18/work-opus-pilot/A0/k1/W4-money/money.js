module.exports = function money(cents) {
  var sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2);
};
