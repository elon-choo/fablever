const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

export function getPointer(obj, pointer) {
  if (pointer === '') return obj;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;

  const segments = pointer.slice(1).split('/');
  let current = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!hasOwn(current, key)) return undefined;
    current = current[key];
  }

  return current;
}
