module.exports = function setPath(obj, path, val) {
  const segments = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '.') {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        segments.push(current);
        current = '';
      }
      let j = i + 1;
      while (j < path.length && path[j] !== ']') {
        j++;
      }
      segments.push(path.substring(i + 1, j));
      i = j;
    } else {
      current += char;
    }
  }
  if (current) {
    segments.push(current);
  }

  let target = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const isNextNumeric = /^\d+$/.test(nextSegment);

    if (target[segment] == null) {
      target[segment] = isNextNumeric ? [] : {};
    }

    target = target[segment];
  }

  target[segments[segments.length - 1]] = val;
  return obj;
};
