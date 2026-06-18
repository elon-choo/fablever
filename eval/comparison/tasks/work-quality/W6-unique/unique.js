module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (out.indexOf(x) === -1) out.push(x);
  return out;
};
