export function normalizePath(p) {
  const parts = [];

  for (const segment of p.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(segment);
  }

  return `/${parts.join('/')}`;
}
