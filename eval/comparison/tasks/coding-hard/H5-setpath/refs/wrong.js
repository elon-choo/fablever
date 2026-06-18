module.exports = function setPath(obj, path, val) {
  const tokens = path.split(/[.[\]]+/).filter(Boolean); // BUG: always creates objects, never arrays
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (cur[tokens[i]] === undefined) cur[tokens[i]] = {};
    cur = cur[tokens[i]];
  }
  cur[tokens[tokens.length - 1]] = val;
  return obj;
};
