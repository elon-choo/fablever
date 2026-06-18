module.exports = function evalExpr(s) {
  let pos = 0;

  function skip() {
    while (pos < s.length && s[pos] === ' ') pos++;
  }

  function primary() {
    skip();
    if (pos < s.length && s[pos] === '(') {
      pos++;
      const val = expr();
      skip();
      if (pos < s.length && s[pos] === ')') pos++;
      return val;
    }
    let num = '';
    while (pos < s.length && /\d/.test(s[pos])) {
      num += s[pos];
      pos++;
    }
    return Number(num);
  }

  function factor() {
    skip();
    if (pos < s.length && s[pos] === '-') {
      pos++;
      return -factor();
    }
    if (pos < s.length && s[pos] === '+') {
      pos++;
      return factor();
    }
    return primary();
  }

  function term() {
    let left = factor();
    while (true) {
      skip();
      if (pos >= s.length || (s[pos] !== '*' && s[pos] !== '/')) break;
      const op = s[pos];
      pos++;
      const right = factor();
      left = op === '*' ? left * right : Math.trunc(left / right);
    }
    return left;
  }

  function expr() {
    let left = term();
    while (true) {
      skip();
      if (pos >= s.length || (s[pos] !== '+' && s[pos] !== '-')) break;
      const op = s[pos];
      pos++;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  return expr();
};
