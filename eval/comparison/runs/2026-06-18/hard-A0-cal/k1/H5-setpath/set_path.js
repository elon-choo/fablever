module.exports = function setPath(obj, path, val) {
  const segments = [];
  let current = '';
  let inBracket = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '[') {
      if (current) {
        segments.push({ type: 'key', value: current });
        current = '';
      }
      inBracket = true;
    } else if (char === ']') {
      if (inBracket) {
        segments.push({ type: 'index', value: parseInt(current, 10) });
        current = '';
      }
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push({ type: 'key', value: current });
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    segments.push({ type: 'key', value: current });
  }

  let target = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (segment.type === 'key') {
      if (!(segment.value in target)) {
        const nextSegment = segments[i + 1];
        target[segment.value] = nextSegment.type === 'index' ? [] : {};
      }
      target = target[segment.value];
    } else {
      if (!Array.isArray(target)) {
        target = [];
      }
      const index = segment.value;
      const nextSegment = segments[i + 1];
      if (!(index in target)) {
        target[index] = nextSegment.type === 'index' ? [] : {};
      }
      target = target[index];
    }
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment.type === 'key') {
    target[lastSegment.value] = val;
  } else {
    target[lastSegment.value] = val;
  }

  return obj;
};
