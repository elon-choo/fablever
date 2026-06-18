module.exports = function setPath(obj, path, val) {
  // Parse path into segments, distinguishing between named keys and numeric indices
  const segments = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '.') {
      if (current) {
        segments.push({ key: current, isIndex: false });
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        segments.push({ key: current, isIndex: false });
        current = '';
      }
      // Extract the content within brackets
      let j = i + 1;
      let index = '';
      while (j < path.length && path[j] !== ']') {
        index += path[j];
        j++;
      }
      segments.push({ key: index, isIndex: true });
      i = j; // Move to the ']'
      // Skip the '.' after ']' if present
      if (i + 1 < path.length && path[i + 1] === '.') {
        i++;
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push({ key: current, isIndex: false });
  }

  // Navigate through the path, creating intermediate structures as needed
  let current_obj = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];

    // Create intermediate structure if it doesn't exist
    if (!current_obj[seg.key]) {
      // Determine if we should create an array or object based on the next segment
      current_obj[seg.key] = nextSeg.isIndex ? [] : {};
    }

    current_obj = current_obj[seg.key];
  }

  // Set the final value
  const lastSeg = segments[segments.length - 1];
  current_obj[lastSeg.key] = val;

  return obj;
};
