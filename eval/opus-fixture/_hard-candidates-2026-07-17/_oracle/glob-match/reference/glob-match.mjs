// Reference implementation.
//
// Pipeline: expand braces -> for each alternative, line up the leading "/",
// split into segments, match segments (with globstar) -> match each segment.

/**
 * Index of the "]" closing the character class that starts at `start` ("["),
 * or -1 when the class is unterminated (the "[" is then a literal).
 */
function classEnd(s, start) {
  let i = start + 1;
  if (s[i] === '!' || s[i] === '^') i++;
  if (s[i] === ']') i++; // a leading "]" is literal and does not close the class
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === ']') return i;
    i++;
  }
  return -1;
}

/** Index of the "}" matching the "{" at `start`, or -1 when there is none. */
function matchingBrace(s, start) {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      const e = classEnd(s, i);
      i = e === -1 ? i + 1 : e + 1;
      continue;
    }
    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

/** First brace group that actually has a closing brace, or null. */
function findGroup(s) {
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      const e = classEnd(s, i);
      i = e === -1 ? i + 1 : e + 1;
      continue;
    }
    if (c === '{') {
      const end = matchingBrace(s, i);
      if (end !== -1) return { start: i, end };
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/** Split a brace-group body on its top-level commas. */
function splitAlternatives(body) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') {
      cur += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '[') {
      const e = classEnd(body, i);
      if (e === -1) {
        cur += c;
        i++;
      } else {
        cur += body.slice(i, e + 1);
        i = e + 1;
      }
      continue;
    }
    if (c === '{') {
      depth++;
      cur += c;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      cur += c;
      i++;
      continue;
    }
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  parts.push(cur);
  return parts;
}

function expandInto(s, out) {
  const group = findGroup(s);
  if (!group) {
    out.push(s);
    return;
  }
  const prefix = s.slice(0, group.start);
  const body = s.slice(group.start + 1, group.end);
  const suffix = s.slice(group.end + 1);
  for (const alt of splitAlternatives(body)) {
    expandInto(prefix + alt + suffix, out);
  }
}

function expandBraces(pattern) {
  const out = [];
  expandInto(pattern, out);
  return out;
}

/** Split a brace-free pattern on separator slashes. */
function splitPatternSegments(p) {
  const segs = [];
  let cur = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '\\') {
      cur += p.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '[') {
      const e = classEnd(p, i);
      if (e === -1) {
        cur += c;
        i++;
      } else {
        cur += p.slice(i, e + 1);
        i = e + 1;
      }
      continue;
    }
    if (c === '/') {
      segs.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  segs.push(cur);
  return segs;
}

function parseClass(text) {
  const end = text.length - 1; // index of the closing "]"
  let i = 1;
  let negated = false;
  if (text[i] === '!' || text[i] === '^') {
    negated = true;
    i++;
  }
  const atoms = [];
  while (i < end) {
    if (text[i] === '\\' && i + 1 <= end) {
      atoms.push({ ch: text[i + 1], escaped: true });
      i += 2;
      continue;
    }
    atoms.push({ ch: text[i], escaped: false });
    i++;
  }
  const ranges = [];
  let j = 0;
  while (j < atoms.length) {
    const a = atoms[j];
    const dash = atoms[j + 1];
    const b = atoms[j + 2];
    if (dash && !dash.escaped && dash.ch === '-' && b) {
      ranges.push({ lo: a.ch, hi: b.ch });
      j += 3;
    } else {
      ranges.push({ lo: a.ch, hi: a.ch });
      j += 1;
    }
  }
  return { type: 'class', negated, ranges };
}

function tokenizeSegment(pat) {
  const items = [];
  let i = 0;
  while (i < pat.length) {
    const c = pat[i];
    if (c === '\\') {
      if (i + 1 < pat.length) {
        items.push({ type: 'lit', ch: pat[i + 1] });
        i += 2;
      } else {
        items.push({ type: 'lit', ch: '\\' });
        i += 1;
      }
      continue;
    }
    if (c === '*') {
      items.push({ type: 'star' });
      i++;
      continue;
    }
    if (c === '?') {
      items.push({ type: 'any' });
      i++;
      continue;
    }
    if (c === '[') {
      const e = classEnd(pat, i);
      if (e === -1) {
        items.push({ type: 'lit', ch: '[' });
        i++;
      } else {
        items.push(parseClass(pat.slice(i, e + 1)));
        i = e + 1;
      }
      continue;
    }
    items.push({ type: 'lit', ch: c });
    i++;
  }
  return items;
}

function classMatches(item, ch) {
  if (ch === '/') return false; // a class never matches "/", not even negated
  const hit = item.ranges.some((r) => ch >= r.lo && ch <= r.hi);
  return item.negated ? !hit : hit;
}

function matchItems(items, ii, str, si) {
  let pi = ii;
  let s = si;
  while (pi < items.length) {
    const item = items[pi];
    if (item.type === 'star') {
      for (let k = s; k <= str.length; k++) {
        if (str[k] === '/') break; // "*" never crosses a segment boundary
        if (matchItems(items, pi + 1, str, k)) return true;
      }
      return false;
    }
    if (s >= str.length) return false;
    const ch = str[s];
    if (item.type === 'any') {
      if (ch === '/') return false;
    } else if (item.type === 'lit') {
      if (ch !== item.ch) return false;
    } else if (!classMatches(item, ch)) {
      return false;
    }
    pi++;
    s++;
  }
  return s === str.length;
}

function matchSegment(pat, str) {
  return matchItems(tokenizeSegment(pat), 0, str, 0);
}

function matchSegs(pSegs, pStart, sSegs, sStart) {
  let pi = pStart;
  let si = sStart;
  while (pi < pSegs.length) {
    if (pSegs[pi] === '**') {
      for (let k = si; k <= sSegs.length; k++) {
        if (matchSegs(pSegs, pi + 1, sSegs, k)) return true;
      }
      return false;
    }
    if (si >= sSegs.length) return false;
    if (!matchSegment(pSegs[pi], sSegs[si])) return false;
    pi++;
    si++;
  }
  return si === sSegs.length;
}

function matchAlternative(pattern, path) {
  const patAbs = pattern.startsWith('/');
  const pathAbs = path.startsWith('/');
  if (patAbs !== pathAbs) return false;
  const p = patAbs ? pattern.slice(1) : pattern;
  const s = pathAbs ? path.slice(1) : path;
  return matchSegs(splitPatternSegments(p), 0, s.split('/'), 0);
}

export function globMatch(pattern, path) {
  for (const alt of expandBraces(pattern)) {
    if (matchAlternative(alt, path)) return true;
  }
  return false;
}
