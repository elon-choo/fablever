module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (!out.includes(x)) out.push(x);
  return out;
};
