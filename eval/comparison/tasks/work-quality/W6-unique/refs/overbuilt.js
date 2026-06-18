module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (!out.includes(x)) out.push(x);
  return out.sort((a, b) => { const x = Number(a), y = Number(b); return (x > y) - (x < y); });
};
