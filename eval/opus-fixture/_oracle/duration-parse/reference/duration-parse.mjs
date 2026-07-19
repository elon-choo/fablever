const UNIT_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const COMPONENT = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)/;

export function parseDuration(s) {
  if (typeof s !== 'string') return null;

  let index = 0;
  let count = 0;
  let total = 0;

  while (index < s.length) {
    while (index < s.length && /\s/.test(s[index])) index += 1;
    if (index === s.length) break;

    const match = COMPONENT.exec(s.slice(index));
    if (!match) return null;

    total += Number(match[1]) * UNIT_MS[match[2]];
    count += 1;
    index += match[0].length;
  }

  if (count === 0 || !Number.isFinite(total) || !Number.isInteger(total)) {
    return null;
  }
  return total;
}
