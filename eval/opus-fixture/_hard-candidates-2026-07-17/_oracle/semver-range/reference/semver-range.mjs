const NUMERIC = /^\d+$/;
const WILDCARD = /^[xX*]$/;
const OPERATOR = /^(>=|<=|>|<|=)(.*)$/;

function mk(major, minor, patch, pre = []) {
  return { major, minor, patch, pre };
}

function splitPre(text) {
  return text === '' ? [] : text.split('.');
}

function parseVersion(input) {
  const text = String(input).trim();
  const dash = text.indexOf('-');
  const core = dash === -1 ? text : text.slice(0, dash);
  const pre = dash === -1 ? '' : text.slice(dash + 1);
  const parts = core.split('.');
  return mk(Number(parts[0]), Number(parts[1]), Number(parts[2]), splitPre(pre));
}

// A "partial" is M / M.m / M.m.p / *, with wildcards only in trailing positions.
// `specified` counts the leading numeric parts before the first wildcard-or-absent part.
function parsePartial(token) {
  const dash = token.indexOf('-');
  const core = dash === -1 ? token : token.slice(0, dash);
  const pre = dash === -1 ? '' : token.slice(dash + 1);
  const nums = [];
  for (const part of core.split('.')) {
    if (part === '' || WILDCARD.test(part)) break;
    nums.push(Number(part));
  }
  return { nums, specified: nums.length, pre: splitPre(pre) };
}

function compareIdentifiers(a, b) {
  const aNum = NUMERIC.test(a);
  const bNum = NUMERIC.test(b);
  if (aNum && bNum) {
    const x = Number(a);
    const y = Number(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  // A numeric identifier always sorts below an alphanumeric one.
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // no prerelease outranks any prerelease
  if (b.length === 0) return -1;
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const verdict = compareIdentifiers(a[i], b[i]);
    if (verdict !== 0) return verdict;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePre(a.pre, b.pre);
}

function expandWildcard(token) {
  const p = parsePartial(token);
  if (p.specified === 0) return [{ op: '>=', v: mk(0, 0, 0) }];
  if (p.specified === 1) {
    return [
      { op: '>=', v: mk(p.nums[0], 0, 0) },
      { op: '<', v: mk(p.nums[0] + 1, 0, 0) },
    ];
  }
  if (p.specified === 2) {
    return [
      { op: '>=', v: mk(p.nums[0], p.nums[1], 0) },
      { op: '<', v: mk(p.nums[0], p.nums[1] + 1, 0) },
    ];
  }
  return [{ op: '=', v: mk(p.nums[0], p.nums[1], p.nums[2], p.pre) }];
}

function expandCaret(body) {
  const p = parsePartial(body);
  const [major, minor, patch] = p.nums;
  let upper;
  if (major > 0) upper = mk(major + 1, 0, 0);
  else if (minor > 0) upper = mk(0, minor + 1, 0);
  else upper = mk(0, 0, patch + 1);
  return [
    { op: '>=', v: mk(major, minor, patch, p.pre) },
    { op: '<', v: upper },
  ];
}

function expandTilde(body) {
  const p = parsePartial(body);
  // ~M with no minor spans the whole major; there is no zero-major special case here.
  if (p.specified === 1) {
    return [
      { op: '>=', v: mk(p.nums[0], 0, 0) },
      { op: '<', v: mk(p.nums[0] + 1, 0, 0) },
    ];
  }
  const major = p.nums[0];
  const minor = p.nums[1];
  const full = p.specified >= 3;
  return [
    { op: '>=', v: mk(major, minor, full ? p.nums[2] : 0, full ? p.pre : []) },
    { op: '<', v: mk(major, minor + 1, 0) },
  ];
}

function expandHyphen(loToken, hiToken) {
  const lo = parsePartial(loToken);
  const hi = parsePartial(hiToken);
  const out = [
    {
      op: '>=',
      v: mk(lo.nums[0] ?? 0, lo.nums[1] ?? 0, lo.nums[2] ?? 0, lo.specified >= 3 ? lo.pre : []),
    },
  ];
  if (hi.specified >= 3) out.push({ op: '<=', v: mk(hi.nums[0], hi.nums[1], hi.nums[2], hi.pre) });
  else if (hi.specified === 2) out.push({ op: '<', v: mk(hi.nums[0], hi.nums[1] + 1, 0) });
  else if (hi.specified === 1) out.push({ op: '<', v: mk(hi.nums[0] + 1, 0, 0) });
  return out;
}

function expandTerm(token) {
  const operator = OPERATOR.exec(token);
  if (operator) return [{ op: operator[1], v: parseVersion(operator[2]) }];
  if (token.startsWith('^')) return expandCaret(token.slice(1));
  if (token.startsWith('~')) return expandTilde(token.slice(1));
  return expandWildcard(token);
}

function expandGroup(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [{ op: '>=', v: mk(0, 0, 0) }]; // empty group behaves like *
  const pool = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i + 1] === '-' && i + 2 < tokens.length) {
      pool.push(...expandHyphen(tokens[i], tokens[i + 2]));
      i += 3;
    } else {
      pool.push(...expandTerm(tokens[i]));
      i += 1;
    }
  }
  return pool;
}

function holds(v, comparator) {
  const verdict = compareVersions(v, comparator.v);
  switch (comparator.op) {
    case '>=': return verdict >= 0;
    case '<=': return verdict <= 0;
    case '>': return verdict > 0;
    case '<': return verdict < 0;
    default: return verdict === 0;
  }
}

function sameTuple(a, b) {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

function groupMatches(v, groupText) {
  const pool = expandGroup(groupText);
  for (const comparator of pool) {
    if (!holds(v, comparator)) return false;
  }
  if (v.pre.length === 0) return true;
  // A prerelease version needs a prerelease comparator at its own tuple, in THIS group.
  return pool.some((comparator) => comparator.v.pre.length > 0 && sameTuple(comparator.v, v));
}

export function satisfies(version, range) {
  const v = parseVersion(version);
  return String(range).split('||').some((group) => groupMatches(v, group));
}
