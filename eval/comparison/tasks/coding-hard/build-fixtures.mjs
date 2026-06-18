// build-fixtures.mjs (HARD pool) — same mutation-verified harness as tasks/coding/, with a HARDER task set
// after the 2026-06-18 run showed the easy pool saturates current models (A0 = 9/9). Each oracle is proven
// by the mutation triad: stub FAILS, solution PASSES, wrong FAILS.
//
// Contamination/memorization note (PROTOCOL §3): these 9 are well-known textbook/interview problems (semver
// pre-release compare, Kahn topo-sort, merge-intervals insert, LRU, deep path-set, token bucket, Roman parse
// w/ validation, weighted edit distance, Pratt-style expr eval). So memorized solutions are PLAUSIBLE — the
// difficulty here is in the under-specified corners the oracle pins (pre-release ordering, touching-interval
// merge, recency-on-get, refill cap, canonical-Roman rejection, substitute-cost-2, trunc-toward-zero), which
// a recalled-but-approximate solution gets wrong. The headline is an A0-vs-A1 DIFFERENCE on the SAME tasks,
// so uniform memorization cancels; the stubs are de-labelled (no "// BUG:" hints) so the model must diagnose.
// Lookup-table cheats are NOT executably blocked (prose clause only) — operator inspects solutions; a task
// that a model clears purely by hardcoding contributes no signal and is expected to wash out in the diff.
//   node build-fixtures.mjs          # write the tree + manifest.sha256, then verify
//   node build-fixtures.mjs verify   # verify the already-written tree only
//   node build-fixtures.mjs stage <dir>   # emit MODEL-VISIBLE subset (stub + PROMPT.txt only)
//   node build-fixtures.mjs score <dir>   # run committed oracle per task in a clean temp dir
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'H1-semver': {
    target: 'semver.js',
    stub: `module.exports = function compare(a, b) {
  const A = a.split('-')[0].split('.').map(Number);
  const B = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
  return 0;
};
`,
    solution: `module.exports = function compare(a, b) {
  const parse = s => { const [c, p] = s.split('-'); return { n: c.split('.').map(Number), p: p ? p.split('.') : null }; };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] < B.n[i] ? -1 : 1;
  if (!A.p && !B.p) return 0;
  if (!A.p) return 1;          // no pre-release outranks a pre-release
  if (!B.p) return -1;
  const k = Math.min(A.p.length, B.p.length);
  for (let i = 0; i < k; i++) {
    const x = A.p[i], y = B.p[i], xn = /^\\d+$/.test(x), yn = /^\\d+$/.test(y);
    if (xn && yn) { if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1; }
    else if (xn) return -1;
    else if (yn) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  if (A.p.length !== B.p.length) return A.p.length < B.p.length ? -1 : 1;
  return 0;
};
`,
    wrong: `module.exports = function compare(a, b) {
  const parse = s => { const [c, p] = s.split('-'); return { n: c.split('.').map(Number), p: p || '' }; };
  const A = parse(a), B = parse(b);
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] < B.n[i] ? -1 : 1;
  if (A.p === B.p) return 0;
  return A.p < B.p ? -1 : 1; // BUG: '' < 'alpha' inverts release/pre-release; lexical numeric ids
};
`,
    test: `const assert = require('assert');
const compare = require('./semver.js');
assert.strictEqual(compare('1.0.0', '1.0.1'), -1);
assert.strictEqual(compare('1.2.0', '1.1.9'), 1);
assert.strictEqual(compare('1.0.0', '1.0.0'), 0);
assert.strictEqual(compare('1.0.0-alpha', '1.0.0'), -1);
assert.strictEqual(compare('1.0.0', '1.0.0-alpha'), 1);
assert.strictEqual(compare('1.0.0-alpha', '1.0.0-alpha.1'), -1);
assert.strictEqual(compare('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
assert.strictEqual(compare('1.0.0-beta.2', '1.0.0-beta.11'), -1);
console.log('H1 ok');
`,
  },

  'H2-toposort': {
    target: 'toposort.js',
    stub: `module.exports = function topoSort(nodes, edges) {
  return nodes.slice();
};
`,
    solution: `module.exports = function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0]));
  const adj = new Map(nodes.map(n => [n, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); indeg.set(b, indeg.get(b) + 1); }
  let q = nodes.filter(n => indeg.get(n) === 0).sort();
  const out = [];
  while (q.length) {
    const n = q.shift(); out.push(n);
    for (const m of adj.get(n)) { indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) q.push(m); }
    q.sort();
  }
  if (out.length !== nodes.length) throw new Error('cycle');
  return out;
};
`,
    wrong: `module.exports = function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map(n => [n, 0]));
  const adj = new Map(nodes.map(n => [n, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); indeg.set(b, indeg.get(b) + 1); }
  let q = nodes.filter(n => indeg.get(n) === 0).sort();
  const out = [];
  while (q.length) {
    const n = q.shift(); out.push(n);
    for (const m of adj.get(n)) { indeg.set(m, indeg.get(m) - 1); if (indeg.get(m) === 0) q.push(m); }
    q.sort();
  }
  return out; // BUG: no cycle detection (returns truncated order instead of throwing)
};
`,
    test: `const assert = require('assert');
const topoSort = require('./toposort.js');
const nodes = ['d', 'a', 'c', 'b'];
const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']];
const order = topoSort(nodes, edges);
assert.deepStrictEqual([...order].sort(), ['a', 'b', 'c', 'd']);
const pos = {}; order.forEach((n, i) => pos[n] = i);
for (const [x, y] of edges) assert.ok(pos[x] < pos[y], x + ' before ' + y);
let threw = false;
try { topoSort(['x', 'y'], [['x', 'y'], ['y', 'x']]); } catch (_) { threw = true; }
assert.ok(threw, 'cycle must throw');
console.log('H2 ok');
`,
  },

  'H3-interval': {
    target: 'insert_interval.js',
    stub: `module.exports = function insert(intervals, newInterval) {
  return intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);
};
`,
    solution: `module.exports = function insert(intervals, newInterval) {
  const all = intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv.slice());
  }
  return out;
};
`,
    wrong: `module.exports = function insert(intervals, newInterval) {
  const all = intervals.concat([newInterval]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] < last[1]) last[1] = Math.max(last[1], iv[1]); // BUG: '<' leaves touching intervals unmerged
    else out.push(iv.slice());
  }
  return out;
};
`,
    test: `const assert = require('assert');
const insert = require('./insert_interval.js');
assert.deepStrictEqual(insert([[1, 3], [6, 9]], [2, 5]), [[1, 5], [6, 9]]);
assert.deepStrictEqual(insert([[1, 3], [5, 7]], [3, 5]), [[1, 7]]);            // touching merges
assert.deepStrictEqual(insert([], [2, 4]), [[2, 4]]);
assert.deepStrictEqual(insert([[1, 2], [4, 5]], [6, 7]), [[1, 2], [4, 5], [6, 7]]);
assert.deepStrictEqual(insert([[1, 5]], [2, 3]), [[1, 5]]);
console.log('H3 ok');
`,
  },

  'H4-lru': {
    target: 'lru.js',
    stub: `module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) { return m.has(k) ? m.get(k) : undefined; },
    put(k, v) { m.set(k, v); },
  };
};
`,
    solution: `module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) { if (!m.has(k)) return undefined; const v = m.get(k); m.delete(k); m.set(k, v); return v; },
    put(k, v) { if (m.has(k)) m.delete(k); m.set(k, v); if (m.size > cap) m.delete(m.keys().next().value); },
  };
};
`,
    wrong: `module.exports = function createLRU(cap) {
  const m = new Map();
  return {
    get(k) { return m.has(k) ? m.get(k) : undefined; }, // BUG: get does not refresh recency
    put(k, v) { if (m.has(k)) m.delete(k); m.set(k, v); if (m.size > cap) m.delete(m.keys().next().value); },
  };
};
`,
    test: `const assert = require('assert');
const createLRU = require('./lru.js');
const L = createLRU(2);
L.put('a', 1); L.put('b', 2);
assert.strictEqual(L.get('a'), 1);     // refresh a -> b is now LRU
L.put('c', 3);                          // evict b, keep a and c
assert.strictEqual(L.get('b'), undefined);
assert.strictEqual(L.get('a'), 1);
assert.strictEqual(L.get('c'), 3);
console.log('H4 ok');
`,
  },

  'H5-setpath': {
    target: 'set_path.js',
    stub: `module.exports = function setPath(obj, path, val) {
  obj[path] = val;
  return obj;
};
`,
    solution: `module.exports = function setPath(obj, path, val) {
  const tokens = [];
  path.replace(/[^.[\\]]+|\\[(\\d+)\\]/g, (m, idx) => { tokens.push(idx !== undefined ? Number(idx) : m); return m; });
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const k = tokens[i];
    if (cur[k] === undefined) cur[k] = typeof tokens[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[tokens[tokens.length - 1]] = val;
  return obj;
};
`,
    wrong: `module.exports = function setPath(obj, path, val) {
  const tokens = path.split(/[.[\\]]+/).filter(Boolean); // BUG: always creates objects, never arrays
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (cur[tokens[i]] === undefined) cur[tokens[i]] = {};
    cur = cur[tokens[i]];
  }
  cur[tokens[tokens.length - 1]] = val;
  return obj;
};
`,
    test: `const assert = require('assert');
const setPath = require('./set_path.js');
const o = {};
setPath(o, 'a.b[2].c', 42);
assert.strictEqual(o.a.b[2].c, 42);
assert.ok(Array.isArray(o.a.b), 'b must be an array');
const o2 = {};
setPath(o2, 'x.y', 1);
assert.strictEqual(o2.x.y, 1);
assert.ok(!Array.isArray(o2.x), 'x must be an object');
console.log('H5 ok');
`,
  },

  'H6-tokenbucket': {
    target: 'token_bucket.js',
    stub: `module.exports = function createLimiter(opts) {
  return function allow(now) { return true; };
};
`,
    solution: `module.exports = function createLimiter(opts) {
  const cap = opts.capacity, rate = opts.refillPerSec;
  let tokens = cap, last = null;
  return function allow(now) {
    if (last === null) last = now;
    tokens = Math.min(cap, tokens + (now - last) * rate);
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
};
`,
    wrong: `module.exports = function createLimiter(opts) {
  const cap = opts.capacity, rate = opts.refillPerSec;
  let tokens = cap, last = null;
  return function allow(now) {
    if (last === null) last = now;
    tokens = tokens + (now - last) * rate; // BUG: no cap on refill -> idle lets a burst exceed capacity
    last = now;
    if (tokens >= 1) { tokens -= 1; return true; }
    return false;
  };
};
`,
    test: `const assert = require('assert');
const createLimiter = require('./token_bucket.js');
const a = createLimiter({ capacity: 2, refillPerSec: 1 });
assert.strictEqual(a(0), true);
assert.strictEqual(a(0), true);
assert.strictEqual(a(0), false);
assert.strictEqual(a(10), true);   // refilled, but capped at 2
assert.strictEqual(a(10), true);
assert.strictEqual(a(10), false);  // cap enforced despite 10s idle
console.log('H6 ok');
`,
  },

  'H7-roman': {
    target: 'roman.js',
    stub: `module.exports = function parseRoman(s) {
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const cur = val[s[i]], next = val[s[i + 1]] || 0; total += cur < next ? -cur : cur; }
  return total;
};
`,
    solution: `function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let r = ''; for (const [v, sym] of map) while (n >= v) { r += sym; n -= v; } return r;
}
module.exports = function parseRoman(s) {
  if (typeof s !== 'string' || !/^[IVXLCDM]+$/.test(s)) throw new Error('invalid');
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const cur = val[s[i]], next = val[s[i + 1]] || 0; total += cur < next ? -cur : cur; }
  if (toRoman(total) !== s) throw new Error('invalid'); // canonical-form check
  return total;
};
`,
    wrong: `module.exports = function parseRoman(s) {
  if (!/^[IVXLCDM]+$/.test(s)) throw new Error('invalid');
  if (/(.)\\1\\1\\1/.test(s)) throw new Error('invalid'); // rejects 4 repeats, but accepts 'IC', 'IL', ...
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const cur = val[s[i]], next = val[s[i + 1]] || 0; total += cur < next ? -cur : cur; }
  return total;
};
`,
    test: `const assert = require('assert');
const parseRoman = require('./roman.js');
assert.strictEqual(parseRoman('I'), 1);
assert.strictEqual(parseRoman('IV'), 4);
assert.strictEqual(parseRoman('IX'), 9);
assert.strictEqual(parseRoman('XIV'), 14);
assert.strictEqual(parseRoman('XC'), 90);
assert.strictEqual(parseRoman('MCMXCIV'), 1994);
for (const bad of ['IIII', 'VV', 'IC', 'IL', 'XM']) {
  let threw = false; try { parseRoman(bad); } catch (_) { threw = true; }
  assert.ok(threw, 'must reject ' + bad);
}
console.log('H7 ok');
`,
  },

  'H8-editdist': {
    target: 'edit_distance.js',
    stub: `module.exports = function editDistance(a, b) {
  return Math.abs(a.length - b.length);
};
`,
    solution: `module.exports = function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const sub = dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2);
    dp[i][j] = Math.min(sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
  }
  return dp[m][n];
};
`,
    wrong: `module.exports = function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const sub = dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1); // BUG: substitute cost 1 (plain Levenshtein)
    dp[i][j] = Math.min(sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
  }
  return dp[m][n];
};
`,
    test: `const assert = require('assert');
const editDistance = require('./edit_distance.js');
assert.strictEqual(editDistance('', ''), 0);
assert.strictEqual(editDistance('abc', 'abc'), 0);
assert.strictEqual(editDistance('a', 'b'), 2);          // substitute costs 2 (Levenshtein would say 1)
assert.strictEqual(editDistance('abc', ''), 3);
assert.strictEqual(editDistance('kitten', 'sitting'), 5);
assert.strictEqual(editDistance('flaw', 'lawn'), 2);
console.log('H8 ok');
`,
  },

  'H9-parens': {
    target: 'eval_expr2.js',
    stub: `module.exports = function evalExpr(s) {
  const t = s.match(/\\d+|[+\\-*/]/g);
  let res = Number(t[0]);
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    res = op === '+' ? res + n : op === '-' ? res - n : op === '*' ? res * n : Math.trunc(res / n);
  }
  return res;
};
`,
    solution: `module.exports = function evalExpr(s) {
  const t = s.replace(/\\s+/g, '');
  let i = 0;
  function factor() {
    if (t[i] === '(') { i++; const v = expr(); i++; return v; }
    if (t[i] === '-') { i++; return -factor(); }
    if (t[i] === '+') { i++; return factor(); }
    let j = i; while (/\\d/.test(t[i])) i++;
    return parseInt(t.slice(j, i), 10);
  }
  function term() {
    let v = factor();
    while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = factor(); v = op === '*' ? v * r : Math.trunc(v / r); }
    return v;
  }
  function expr() {
    let v = term();
    while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  return expr();
};
`,
    wrong: `module.exports = function evalExpr(s) {
  const t = s.replace(/\\s+/g, '');
  let i = 0;
  function factor() {
    if (t[i] === '(') { i++; const v = expr(); i++; return v; }
    if (t[i] === '-') { i++; return -factor(); }
    if (t[i] === '+') { i++; return factor(); }
    let j = i; while (/\\d/.test(t[i])) i++;
    return parseInt(t.slice(j, i), 10);
  }
  function term() {
    let v = factor();
    while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = factor(); v = op === '*' ? v * r : Math.floor(v / r); } // BUG: floor, not trunc toward zero
    return v;
  }
  function expr() {
    let v = term();
    while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  return expr();
};
`,
    test: `const assert = require('assert');
const evalExpr = require('./eval_expr2.js');
assert.strictEqual(evalExpr('2+3*4'), 14);
assert.strictEqual(evalExpr('2*(3+4)'), 14);
assert.strictEqual(evalExpr('-3+5'), 2);
assert.strictEqual(evalExpr('2*-3'), -6);
assert.strictEqual(evalExpr('(1+2)*(3+4)'), 21);
assert.strictEqual(evalExpr('7/2'), 3);        // truncate, not round (Math.round(3.5)=4)
assert.strictEqual(evalExpr('(0-7)/2'), -3);   // truncate toward zero, not floor (-4)
console.log('H9 ok');
`,
  },
};

const ANTIHARDCODE = 'Implement the GENERAL behaviour. Do NOT hardcode, lookup-table, or special-case ' +
  'specific inputs — a solution that only handles a few cases will be rejected on inspection.';
const PROMPTS = {
  'H1-semver': 'Implement compare(a,b) in semver.js returning -1/0/1 for two semantic versions, INCLUDING pre-release precedence: a version with a pre-release tag (e.g. "1.0.0-alpha") is LOWER than the same version without it; pre-release identifiers are compared left-to-right, numeric ones numerically and ranked below alphanumeric ones, and when all leading identifiers are equal the version with fewer identifiers is lower.',
  'H2-toposort': 'Implement topoSort(nodes, edges) in toposort.js. edges is a list of [a,b] meaning a must come before b. Return an ordering of ALL nodes that respects every edge; THROW an error if the graph contains a cycle.',
  'H3-interval': 'Implement insert(intervals, newInterval) in insert_interval.js. intervals is a sorted, non-overlapping list of [start,end] pairs. Insert newInterval, merging any overlaps — including intervals that merely touch at an endpoint, e.g. [1,3] and [3,5] merge into [1,5] — and return the sorted, non-overlapping result.',
  'H4-lru': 'Implement createLRU(cap) in lru.js returning an object with get(k) and put(k,v). It is an LRU cache holding at most cap entries. get returns the value (or undefined) AND counts as a use; put inserts or updates and, when over capacity, evicts the least-recently-used entry.',
  'H5-setpath': 'Implement setPath(obj, path, val) in set_path.js. path looks like "a.b[2].c". Set the nested value, creating intermediate plain objects for named keys and ARRAYS for numeric [i] indices, then return obj.',
  'H6-tokenbucket': 'Implement createLimiter({capacity, refillPerSec}) in token_bucket.js returning allow(now). It is a token-bucket rate limiter that STARTS FULL (capacity tokens): tokens refill at refillPerSec per unit of time, capped at capacity; allow consumes one token and returns true if at least one is available (now is a non-decreasing timestamp), otherwise false.',
  'H7-roman': 'Implement parseRoman(s) in roman.js: convert a Roman numeral string to an integer, and THROW for any invalid numeral (e.g. "IIII", "IC", "VV", "IL").',
  'H8-editdist': 'Implement editDistance(a,b) in edit_distance.js: the minimum total cost to transform a into b where an insertion costs 1, a deletion costs 1, and a substitution costs 2.',
  'H9-parens': 'Implement evalExpr(s) in eval_expr2.js: evaluate an integer arithmetic expression supporting + - * /, parentheses, and unary minus, with correct operator precedence; division truncates toward zero (so (0-7)/2 = -3, not -4).',
};

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const runTest = dir => spawnSync(process.execPath, ['test.js'], { cwd: dir, encoding: 'utf8' });

function writeTree() {
  const manifest = [];
  for (const [id, t] of Object.entries(TASKS)) {
    const dir = path.join(HERE, id);
    fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(dir, t.target), t.stub);
    fs.writeFileSync(path.join(dir, 'test.js'), t.test);
    fs.writeFileSync(path.join(dir, 'refs', 'solution.js'), t.solution);
    fs.writeFileSync(path.join(dir, 'refs', 'wrong.js'), t.wrong);
    manifest.push(`${sha(t.test)}  ${id}/test.js`);
    manifest.push(`${sha(t.stub)}  ${id}/${t.target}`);
  }
  fs.writeFileSync(path.join(HERE, 'manifest.sha256'), manifest.join('\n') + '\n');
  console.log(`wrote ${Object.keys(TASKS).length} fixtures + manifest.sha256`);
}

function verify() {
  let allOk = true;
  for (const [id, t] of Object.entries(TASKS)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hfx-'));
    fs.writeFileSync(path.join(tmp, 'test.js'), t.test);
    const run = src => { fs.writeFileSync(path.join(tmp, t.target), src); return runTest(tmp).status === 0; };
    const stubPass = run(t.stub), solPass = run(t.solution), wrongPass = run(t.wrong);
    fs.rmSync(tmp, { recursive: true, force: true });
    const ok = stubPass === false && solPass === true && wrongPass === false;
    allOk = allOk && ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  [stub fails:${!stubPass} | solution passes:${solPass} | wrong fails:${!wrongPass}]`);
  }
  console.log(allOk ? '\nALL FIXTURE ORACLES SOUND (mutation triad holds)' : '\nSOME ORACLES UNSOUND — fix before sealing');
  return allOk;
}

function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, t.target), t.stub);
    fs.writeFileSync(path.join(d, 'PROMPT.txt'), `${PROMPTS[id]}\n\n${ANTIHARDCODE}\n`);
  }
  console.log(`staged ${Object.keys(TASKS).length} model-visible tasks to ${dest} (stub + PROMPT.txt only)`);
}

function score(modelDir) {
  const results = [];
  for (const [id, t] of Object.entries(TASKS)) {
    const modelFile = path.join(modelDir, id, t.target);
    let pass = false, note = '';
    try {
      const src = fs.readFileSync(modelFile, 'utf8');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hscore-'));
      fs.writeFileSync(path.join(tmp, 'test.js'), t.test);
      fs.writeFileSync(path.join(tmp, t.target), src);
      pass = runTest(tmp).status === 0;
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) { note = 'missing model file'; }
    results.push({ id, pass, note });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}${note ? '  (' + note + ')' : ''}`);
  }
  const n = results.filter(r => r.pass).length;
  console.log(`\nscore: ${n}/${results.length}`);
  return results;
}

const mode = process.argv[2] || 'all';
if (mode === 'verify') process.exit(verify() ? 0 : 1);
if (mode === 'stage') { stage(process.argv[3] || path.join(os.tmpdir(), 'fable-staged-hard')); process.exit(0); }
if (mode === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree();
process.exit(verify() ? 0 : 1);
