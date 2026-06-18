module.exports = function setPath(obj, path, val) {
  const tokens = [];
  path.replace(/[^.[\]]+|\[(\d+)\]/g, (m, idx) => { tokens.push(idx !== undefined ? Number(idx) : m); return m; });
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const k = tokens[i];
    if (cur[k] === undefined) cur[k] = typeof tokens[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[tokens[tokens.length - 1]] = val;
  return obj;
};
