module.exports = function evalExpr(s) {
  const t = s.replace(/\s+/g, '');
  let i = 0;
  function factor() {
    if (t[i] === '(') { i++; const v = expr(); i++; return v; }
    if (t[i] === '-') { i++; return -factor(); }
    if (t[i] === '+') { i++; return factor(); }
    let j = i; while (/\d/.test(t[i])) i++;
    return parseInt(t.slice(j, i), 10);
  }
  function term() {
    let v = factor();
    while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = factor(); v = op === '*' ? v * r : Math.floor(v / r); } // BUG: floor, not trunc toward zero
    return v;
  }
  function expr() {
    let v = term();
    while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  return expr();
};
