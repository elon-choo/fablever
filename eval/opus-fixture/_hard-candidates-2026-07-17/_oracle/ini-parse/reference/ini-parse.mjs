const NUMERIC = /^-?\d+(\.\d+)?$/;

function stripComment(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '\\') i++;
      else if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ';' || ch === '#') {
      if (i === 0) return '';
      if (/\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function closingQuote(raw) {
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\') i++;
    else if (ch === '"') return i;
  }
  return -1;
}

function decodeEscapes(inner) {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] !== '\\') {
      out += inner[i];
      continue;
    }
    const next = inner[i + 1];
    if (next === 'n') { out += '\n'; i++; }
    else if (next === 't') { out += '\t'; i++; }
    else if (next === '"') { out += '"'; i++; }
    else if (next === '\\') { out += '\\'; i++; }
    else out += '\\';
  }
  return out;
}

function coerceBare(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (NUMERIC.test(raw) && String(Number(raw)) === raw) return Number(raw);
  return raw;
}

function decodeValue(raw) {
  if (raw.startsWith('"') && closingQuote(raw) === raw.length - 1) {
    return decodeEscapes(raw.slice(1, -1));
  }
  return coerceBare(raw);
}

function assign(container, key, value) {
  if (!Object.prototype.hasOwnProperty.call(container, key)) {
    container[key] = value;
    return;
  }
  const existing = container[key];
  if (Array.isArray(existing)) existing.push(value);
  else container[key] = [existing, value];
}

export function parseIni(text) {
  const root = {};
  let container = root;

  for (const rawLine of String(text).split('\n')) {
    const line = stripComment(rawLine.trim()).trim();
    if (line === '') continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      container = root;
      for (const segment of line.slice(1, -1).trim().split('.')) {
        const name = segment.trim();
        const existing = container[name];
        container[name] = existing && typeof existing === 'object' && !Array.isArray(existing)
          ? existing
          : {};
        container = container[name];
      }
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === '') continue;
    assign(container, key, decodeValue(line.slice(eq + 1).trim()));
  }

  return root;
}
