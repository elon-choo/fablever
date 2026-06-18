module.exports = function evalExpr(s) {
  const t = s.match(/\d+|[+\-*/]/g);
  let res = Number(t[0]);
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    res = op === '+' ? res + n : op === '-' ? res - n : op === '*' ? res * n : Math.trunc(res / n);
  }
  return res;
};
