module.exports = function setPath(obj, path, val) {
  // Parse path into segments
  const segments = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '.') {
      if (current) {
        segments.push({ type: 'key', value: current });
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        segments.push({ type: 'key', value: current });
        current = '';
      }
      const closeIdx = path.indexOf(']', i);
      const indexStr = path.substring(i + 1, closeIdx);
      segments.push({ type: 'index', value: parseInt(indexStr) });
      i = closeIdx;
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push({ type: 'key', value: current });
  }

  // Navigate and create structure
  let pointer = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];

    if (seg.type === 'key') {
      if (!(seg.value in pointer)) {
        pointer[seg.value] = nextSeg.type === 'index' ? [] : {};
      }
      pointer = pointer[seg.value];
    } else if (seg.type === 'index') {
      if (!pointer[seg.value]) {
        pointer[seg.value] = nextSeg.type === 'index' ? [] : {};
      }
      pointer = pointer[seg.value];
    }
  }

  // Set the final value
  const lastSeg = segments[segments.length - 1];
  if (lastSeg.type === 'key') {
    pointer[lastSeg.value] = val;
  } else if (lastSeg.type === 'index') {
    pointer[lastSeg.value] = val;
  }

  return obj;
};
