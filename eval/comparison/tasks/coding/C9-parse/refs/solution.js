module.exports = function evalExpr(s) {
  const t = s.match(/\d+|[+\-*/]/g);
  const nums = [Number(t[0])], ops = [];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    if (op === '*') nums[nums.length - 1] *= n;
    else if (op === '/') nums[nums.length - 1] = Math.trunc(nums[nums.length - 1] / n);
    else { nums.push(n); ops.push(op); }
  }
  let res = nums[0];
  for (let i = 0; i < ops.length; i++) res = ops[i] === '+' ? res + nums[i + 1] : res - nums[i + 1];
  return res;
};
