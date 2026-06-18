module.exports = function evalExpr(s) {
  const tokens = s.match(/\d+|[+\-*/]/g);

  let nums = [];
  let ops = [];

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      nums.push(Number(tokens[i]));
    } else {
      ops.push(tokens[i]);
    }
  }

  // First pass: handle * and / (higher precedence)
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '*' || ops[i] === '/') {
      const left = nums[i];
      const right = nums[i + 1];
      const result = ops[i] === '*' ? left * right : Math.trunc(left / right);
      nums.splice(i, 2, result);
      ops.splice(i, 1);
      i--;
    }
  }

  // Second pass: handle + and - (lower precedence)
  let result = nums[0];
  for (let i = 0; i < ops.length; i++) {
    const right = nums[i + 1];
    result = ops[i] === '+' ? result + right : result - right;
  }

  return result;
};
