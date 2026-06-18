module.exports = function evalExpr(s) {
  const tokens = s.match(/\d+|[+\-*/()]/g) || [];
  let idx = 0;

  function parseExpr() {
    let result = parseTerm();
    while (idx < tokens.length && (tokens[idx] === '+' || tokens[idx] === '-')) {
      const op = tokens[idx++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (idx < tokens.length && (tokens[idx] === '*' || tokens[idx] === '/')) {
      const op = tokens[idx++];
      const right = parseFactor();
      result = op === '*' ? result * right : Math.trunc(result / right);
    }
    return result;
  }

  function parseFactor() {
    if (tokens[idx] === '-') {
      idx++;
      return -parseFactor();
    }
    if (tokens[idx] === '(') {
      idx++;
      const result = parseExpr();
      idx++;
      return result;
    }
    return Number(tokens[idx++]);
  }

  return parseExpr();
};
