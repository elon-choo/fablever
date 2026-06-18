module.exports = function parseRoman(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

  if (!s || typeof s !== 'string') {
    throw new Error('Invalid input');
  }

  for (let i = 0; i < s.length; i++) {
    if (!val.hasOwnProperty(s[i])) {
      throw new Error('Invalid character in Roman numeral');
    }
  }

  const noRepeat = new Set(['V', 'L', 'D']);

  for (let i = 0; i < s.length; ) {
    const char = s[i];
    let count = 1;
    while (i + count < s.length && s[i + count] === char) {
      count++;
    }

    if (noRepeat.has(char) && count > 1) {
      throw new Error('Invalid numeral');
    }

    if ((char === 'I' || char === 'X' || char === 'C' || char === 'M') && count > 3) {
      throw new Error('Invalid numeral');
    }

    i += count;
  }

  for (let i = 0; i < s.length - 1; i++) {
    const cur = val[s[i]];
    const next = val[s[i + 1]];

    if (cur < next) {
      const validSubtractive = {
        1: new Set([5, 10]),
        10: new Set([50, 100]),
        100: new Set([500, 1000])
      };

      if (!validSubtractive[cur] || !validSubtractive[cur].has(next)) {
        throw new Error('Invalid numeral');
      }
    }
  }

  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = val[s[i]];
    const next = val[s[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }

  return total;
};
