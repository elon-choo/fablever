function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let r = ''; for (const [v, sym] of map) while (n >= v) { r += sym; n -= v; } return r;
}
module.exports = function parseRoman(s) {
  if (typeof s !== 'string' || !/^[IVXLCDM]+$/.test(s)) throw new Error('invalid');
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const cur = val[s[i]], next = val[s[i + 1]] || 0; total += cur < next ? -cur : cur; }
  if (toRoman(total) !== s) throw new Error('invalid'); // canonical-form check
  return total;
};
