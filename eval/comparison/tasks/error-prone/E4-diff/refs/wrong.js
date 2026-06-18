module.exports = function diff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return { added: b.filter(x => !sa.has(x)), removed: a.filter(x => !sb.has(x)) }; // BUG: ignores multiplicity, dups
};
