module.exports = function evalExpr(s) {
  const t = s.match(/\d+|[+\-*/]/g);

  // First pass: evaluate * and / (higher precedence)
  for (let i = 1; i < t.length; i += 2) {
    if (t[i] === '*' || t[i] === '/') {
      const left = Number(t[i - 1]);
      const right = Number(t[i + 1]);
      const result = t[i] === '*' ? left * right : Math.trunc(left / right);
      t.splice(i - 1, 3, String(result));
      i -= 2;
    }
  }

  // Second pass: evaluate + and - (lower precedence)
  let res = Number(t[0]);
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    res = op === '+' ? res + n : res - n;
  }

  return res;
};
