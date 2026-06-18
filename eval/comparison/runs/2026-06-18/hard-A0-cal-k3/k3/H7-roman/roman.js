module.exports = function parseRoman(s) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

  // Check for invalid characters
  for (const char of s) {
    if (!values[char]) {
      throw new Error(`Invalid Roman numeral: ${s}`);
    }
  }

  // V, L, D can appear at most once each
  if ((s.match(/V/g) || []).length > 1 ||
      (s.match(/L/g) || []).length > 1 ||
      (s.match(/D/g) || []).length > 1) {
    throw new Error(`Invalid Roman numeral: ${s}`);
  }

  // I, X, C, M cannot appear more than 3 times consecutively
  if (s.match(/I{4,}/) || s.match(/X{4,}/) || s.match(/C{4,}/) || s.match(/M{4,}/)) {
    throw new Error(`Invalid Roman numeral: ${s}`);
  }

  // Check for invalid subtractive combinations
  for (let i = 0; i < s.length - 1; i++) {
    const cur = s[i];
    const next = s[i + 1];
    const curVal = values[cur];
    const nextVal = values[next];

    if (curVal < nextVal) {
      // I can only subtract from V or X
      if (cur === 'I' && next !== 'V' && next !== 'X') {
        throw new Error(`Invalid Roman numeral: ${s}`);
      }
      // X can only subtract from L or C
      if (cur === 'X' && next !== 'L' && next !== 'C') {
        throw new Error(`Invalid Roman numeral: ${s}`);
      }
      // C can only subtract from D or M
      if (cur === 'C' && next !== 'D' && next !== 'M') {
        throw new Error(`Invalid Roman numeral: ${s}`);
      }
      // V, L, D cannot be in subtractive position
      if (cur === 'V' || cur === 'L' || cur === 'D') {
        throw new Error(`Invalid Roman numeral: ${s}`);
      }
    }
  }

  // Parse the Roman numeral
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = values[s[i]];
    const next = values[s[i + 1]] || 0;

    if (cur < next) {
      total += next - cur;
      i++; // Skip next character as it's part of subtractive pair
    } else {
      total += cur;
    }
  }

  return total;
};
