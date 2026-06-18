module.exports = function parseRoman(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

  for (const char of s) {
    if (!(char in val)) throw new Error(`Invalid character: ${char}`);
  }

  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'V' || s[i] === 'L' || s[i] === 'D') {
      if (s[i] === s[i + 1]) throw new Error(`${s[i]} cannot repeat`);
    } else {
      let count = 1;
      while (i + count < s.length && s[i + count] === s[i]) count++;
      if (count > 3) throw new Error(`${s[i]} repeated more than 3 times`);
    }
  }

  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = val[s[i]];
    const next = val[s[i + 1]];

    if (next && cur < next) {
      const pair = s[i] + s[i + 1];
      if (!['IV', 'IX', 'XL', 'XC', 'CD', 'CM'].includes(pair)) {
        throw new Error(`Invalid subtractive pair: ${pair}`);
      }
      total += next - cur;
      i++;
    } else {
      total += cur;
    }
  }

  return total;
};
