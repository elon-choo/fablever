// build-fixtures.mjs (ERROR-PRONE axis) — tasks whose SPEC is clear but whose first-draft IMPLEMENTATION is
// easy to get subtly wrong (boundary/state bugs). The point: find headroom where PLAIN Opus actually fails,
// so a verification-before-completion PROCESS can be shown to beat it. Each oracle is mutation-checked:
// stub FAILS, solution PASSES, a plausible naive "wrong" FAILS.
//   node build-fixtures.mjs            # write tree + verify triad
//   node build-fixtures.mjs verify
//   node build-fixtures.mjs stage <dir>   # stub + PROMPT.txt only
//   node build-fixtures.mjs score <dir>
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'E1-interval': {
    target: 'intersect.js',
    prompt: 'Implement intersect(A, B) in intersect.js. A and B are each a sorted list of CLOSED integer intervals [start,end] (non-overlapping within a list). Return the list of intervals that are in BOTH A and B (their intersection), sorted. Intervals touching at a single point count: [1,3] and [3,5] intersect at [3,3]. Result intervals must be non-empty (start <= end).',
    stub: `module.exports = function intersect(A, B) {\n  return [];\n};\n`,
    solution: `module.exports = function intersect(A, B) {
  const out = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return out;
};\n`,
    wrong: `module.exports = function intersect(A, B) {
  const out = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]);
    if (lo < hi) out.push([lo, hi]); // BUG: strict, drops single-point touches
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return out;
};\n`,
    test: `const assert=require('assert');const f=require('./intersect.js');
assert.deepStrictEqual(f([[0,2],[5,10]],[[1,6]]),[[1,2],[5,6]]);
assert.deepStrictEqual(f([[1,3]],[[3,5]]),[[3,3]]);
assert.deepStrictEqual(f([[0,4],[7,9]],[[2,3],[8,8]]),[[2,3],[8,8]]);
assert.deepStrictEqual(f([[0,1]],[[2,3]]),[]);
assert.deepStrictEqual(f([],[[1,2]]),[]);
console.log('E1 ok');\n`,
  },
  'E2-window': {
    target: 'window_max.js',
    prompt: 'Implement windowMax(arr, k) in window_max.js: return an array of the maximum of every contiguous window of length k. The result has length arr.length - k + 1. If k is larger than arr.length, return []. k is always >= 1.',
    stub: `module.exports = function windowMax(arr, k) {\n  return [];\n};\n`,
    solution: `module.exports = function windowMax(arr, k) {
  if (k > arr.length) return [];
  const out = [];
  for (let i = 0; i + k <= arr.length; i++) {
    let m = arr[i];
    for (let j = i + 1; j < i + k; j++) if (arr[j] > m) m = arr[j];
    out.push(m);
  }
  return out;
};\n`,
    wrong: `module.exports = function windowMax(arr, k) {
  const out = [];
  for (let i = 0; i + k < arr.length; i++) { // BUG: < drops the last window
    let m = arr[i];
    for (let j = i + 1; j < i + k; j++) if (arr[j] > m) m = arr[j];
    out.push(m);
  }
  return out;
};\n`,
    test: `const assert=require('assert');const f=require('./window_max.js');
assert.deepStrictEqual(f([1,3,2,5,4],2),[3,3,5,5]);
assert.deepStrictEqual(f([4,2,1],3),[4]);
assert.deepStrictEqual(f([1,2],3),[]);
assert.deepStrictEqual(f([7,7,7],1),[7,7,7]);
assert.deepStrictEqual(f([5],1),[5]);
console.log('E2 ok');\n`,
  },
  'E3-query': {
    target: 'parse_query.js',
    prompt: 'Implement parseQuery(s) in parse_query.js. Parse a URL query string (no leading "?"). Split on "&". Each part is key=value. A key that appears ONCE maps to its string value. A key that appears MORE THAN ONCE maps to an array of its values in order. A part with no "=" (or empty value) maps the key to "". Empty input returns {}.',
    stub: `module.exports = function parseQuery(s) {\n  return {};\n};\n`,
    solution: `module.exports = function parseQuery(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split('&')) {
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    if (k in out) { if (Array.isArray(out[k])) out[k].push(v); else out[k] = [out[k], v]; }
    else out[k] = v;
  }
  return out;
};\n`,
    wrong: `module.exports = function parseQuery(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split('&')) {
    const [k, v] = part.split('='); // BUG: last wins, no array for repeats; v undefined not ''
    out[k] = v === undefined ? '' : v;
  }
  return out;
};\n`,
    test: `const assert=require('assert');const f=require('./parse_query.js');
assert.deepStrictEqual(f('a=1&b=2'),{a:'1',b:'2'});
assert.deepStrictEqual(f('a=1&a=2&a=3'),{a:['1','2','3']});
assert.deepStrictEqual(f('x'),{x:''});
assert.deepStrictEqual(f('k='),{k:''});
assert.deepStrictEqual(f(''),{});
console.log('E3 ok');\n`,
  },
  'E4-diff': {
    target: 'diff_count.js',
    prompt: 'Implement diff(a, b) in diff_count.js comparing two arrays as MULTISETS. Return { added, removed } where added lists elements present more times in b than in a (one entry per extra occurrence), and removed lists elements present more times in a than in b. Order each output by first appearance in b (added) / a (removed). Elements are primitives.',
    stub: `module.exports = function diff(a, b) {\n  return { added: [], removed: [] };\n};\n`,
    solution: `module.exports = function diff(a, b) {
  const count = arr => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  const added = [], removed = [], sa = new Map(), sr = new Map();
  for (const x of b) { const need = (cb.get(x) || 0) - (ca.get(x) || 0); const d = sa.get(x) || 0; if (d < need) { added.push(x); sa.set(x, d + 1); } }
  for (const x of a) { const need = (ca.get(x) || 0) - (cb.get(x) || 0); const d = sr.get(x) || 0; if (d < need) { removed.push(x); sr.set(x, d + 1); } }
  return { added, removed };
};\n`,
    wrong: `module.exports = function diff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return { added: b.filter(x => !sa.has(x)), removed: a.filter(x => !sb.has(x)) }; // BUG: ignores multiplicity, dups
};\n`,
    test: `const assert=require('assert');const f=require('./diff_count.js');
assert.deepStrictEqual(f([1,2,2,3],[2,3,3,4]),{added:[3,4],removed:[1,2]});
assert.deepStrictEqual(f([1,1,1],[1]),{added:[],removed:[1,1]});
assert.deepStrictEqual(f([],[5,5]),{added:[5,5],removed:[]});
assert.deepStrictEqual(f([1,2],[1,2]),{added:[],removed:[]});
console.log('E4 ok');\n`,
  },
  'E5-flatten': {
    target: 'flatten_depth.js',
    prompt: 'Implement flattenDepth(arr, depth) in flatten_depth.js: flatten nested arrays but only up to `depth` levels. depth=0 returns a shallow copy unchanged. depth=1 flattens one level. depth can be Infinity. Non-array elements pass through. Default depth is 1 when omitted.',
    stub: `module.exports = function flattenDepth(arr, depth) {\n  return arr;\n};\n`,
    solution: `module.exports = function flattenDepth(arr, depth = 1) {
  if (depth < 1) return arr.slice();
  const out = [];
  for (const x of arr) { if (Array.isArray(x)) out.push(...flattenDepth(x, depth - 1)); else out.push(x); }
  return out;
};\n`,
    wrong: `module.exports = function flattenDepth(arr, depth = 1) {
  const out = [];
  for (const x of arr) { if (Array.isArray(x)) out.push(...flattenDepth(x, depth - 1)); else out.push(x); }
  return out; // BUG: no dep<1 base case -> ignores depth, flattens fully
};\n`,
    test: `const assert=require('assert');const f=require('./flatten_depth.js');
assert.deepStrictEqual(f([1,[2,[3,[4]]]],1),[1,2,[3,[4]]]);
assert.deepStrictEqual(f([1,[2,[3]]],0),[1,[2,[3]]]);
assert.deepStrictEqual(f([1,[2,[3,[4]]]],Infinity),[1,2,3,4]);
assert.deepStrictEqual(f([1,[2,3]]),[1,2,3]);
console.log('E5 ok');\n`,
  },
  'E6-round': {
    target: 'bankers.js',
    prompt: 'Implement round(x) in bankers.js using round-half-to-even (banker\'s rounding) to the nearest integer: when x is exactly halfway between two integers, round to the EVEN one. Otherwise round normally. Works for negatives. Examples: 0.5->0, 1.5->2, 2.5->2, 3.5->4.',
    stub: `module.exports = function round(x) {\n  return Math.round(x);\n};\n`,
    solution: `module.exports = function round(x) {
  const f = Math.floor(x), diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
};\n`,
    wrong: `module.exports = function round(x) {
  return Math.round(x); // BUG: 0.5->1, 2.5->3, and -0.5->0 vs -1.5->-1 (not half-even)
};\n`,
    test: `const assert=require('assert');const f=require('./bankers.js');
assert.strictEqual(f(0.5),0); assert.strictEqual(f(1.5),2);
assert.strictEqual(f(2.5),2); assert.strictEqual(f(3.5),4);
assert.strictEqual(f(-0.5),0); assert.strictEqual(f(-1.5),-2); assert.strictEqual(f(-2.5),-2);
assert.strictEqual(f(2.4),2); assert.strictEqual(f(2.6),3);
console.log('E6 ok');\n`,
  },
};

const runTest = dir => spawnSync(process.execPath, ['test.js'], { cwd: dir, encoding: 'utf8' });
function writeTree() {
  for (const [id, t] of Object.entries(TASKS)) {
    const dir = path.join(HERE, id); fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(dir, t.target), t.stub); fs.writeFileSync(path.join(dir, 'test.js'), t.test);
    fs.writeFileSync(path.join(dir, 'refs', 'solution.js'), t.solution); fs.writeFileSync(path.join(dir, 'refs', 'wrong.js'), t.wrong);
  }
  console.log(`wrote ${Object.keys(TASKS).length} fixtures`);
}
function verify() {
  let allOk = true;
  for (const [id, t] of Object.entries(TASKS)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-')); fs.writeFileSync(path.join(tmp, 'test.js'), t.test);
    const run = src => { fs.writeFileSync(path.join(tmp, t.target), src); return runTest(tmp).status === 0; };
    const s = run(t.stub), so = run(t.solution), w = run(t.wrong); fs.rmSync(tmp, { recursive: true, force: true });
    const ok = !s && so && !w; allOk = allOk && ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  [stub fails:${!s} | solution passes:${so} | wrong fails:${!w}]`);
  }
  console.log(allOk ? '\nALL ORACLES SOUND' : '\nSOME UNSOUND'); return allOk;
}
function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, t.target), t.stub); fs.writeFileSync(path.join(d, 'PROMPT.txt'), t.prompt + '\n');
  }
  console.log(`staged ${Object.keys(TASKS).length} to ${dest}`);
}
function score(modelDir) {
  const rows = [];
  for (const [id, t] of Object.entries(TASKS)) {
    let pass = false; try { const src = fs.readFileSync(path.join(modelDir, id, t.target), 'utf8');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eps-')); fs.writeFileSync(path.join(tmp, 'test.js'), t.test); fs.writeFileSync(path.join(tmp, t.target), src);
      pass = runTest(tmp).status === 0; fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    rows.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}`);
  }
  console.log(`\nscore: ${rows.filter(r => r.pass).length}/${rows.length}`); return rows;
}
const mode = process.argv[2] || 'all';
if (mode === 'verify') process.exit(verify() ? 0 : 1);
if (mode === 'stage') { stage(process.argv[3]); process.exit(0); }
if (mode === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree(); process.exit(verify() ? 0 : 1);
