module.exports = function evalExpr(s) {
  const tokens = s.match(/\d+|[+\-*/]/g);

  const nums = [];
  const ops = [];

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      nums.push(Number(tokens[i]));
    } else {
      ops.push(tokens[i]);
    }
  }

  // First pass: handle * and / (higher precedence)
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '*') {
      nums[i] = nums[i] * nums[i + 1];
      nums.splice(i + 1, 1);
      ops.splice(i, 1);
      i--;
    } else if (ops[i] === '/') {
      nums[i] = Math.trunc(nums[i] / nums[i + 1]);
      nums.splice(i + 1, 1);
      ops.splice(i, 1);
      i--;
    }
  }

  // Second pass: handle + and - (lower precedence)
  let result = nums[0];
  for (let i = 0; i < ops.length; i++) {
    result = ops[i] === '+' ? result + nums[i + 1] : result - nums[i + 1];
  }

  return result;
};
