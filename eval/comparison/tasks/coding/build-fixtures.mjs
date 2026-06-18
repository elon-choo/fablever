// build-fixtures.mjs — generates the frozen coding-fixture tree AND self-verifies each oracle by a
// mutation triad: the STUB must FAIL, the SOLUTION must PASS, the WRONG reference must FAIL. This is the
// committed proof (round-2 C-1/H-3/M-1) that every §4b check is a real, non-rubber-stamp oracle.
//
//   node build-fixtures.mjs           # write the tree + manifest.sha256, then verify (default)
//   node build-fixtures.mjs verify    # verify the already-written tree only
//
// Each task: { target, stub, test, solution, wrong }. The model in the study edits `target` (starts as
// `stub`); `test.js` is the sole arbiter. solution/wrong are NOT shown to the model — they only prove the
// oracle is sound. Verify runs in a throwaway temp dir; the committed tree ships the stub + test + refs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'C1-bugfix': {
    target: 'parse_range.js',
    stub: `module.exports = function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const out = [];
  for (let i = a; i < b; i++) out.push(i); // BUG: excludes the upper bound
  return out;
};
`,
    solution: `module.exports = function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};
`,
    wrong: `module.exports = function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const out = [];
  for (let i = a; i <= b + 1; i++) out.push(i); // overshoots
  return out;
};
`,
    test: `const assert = require('assert');
const parseRange = require('./parse_range.js');
assert.deepStrictEqual(parseRange('1-3'), [1, 2, 3]);
assert.deepStrictEqual(parseRange('5-5'), [5]);
assert.deepStrictEqual(parseRange('2-4'), [2, 3, 4]);
console.log('C1 ok');
`,
  },

  // C2 extends a shallow helper to handle arbitrary depth — a correctness oracle (no timing/complexity
  // gate, which JS cannot unit-test robustly: V8's indexOf is SIMD-fast so O(n^2) vs O(n) is not reliably
  // separable by wall-clock, and a lexical "no nested loop" check is the brittle approach round-2 rejected).
  'C2-flatten': {
    target: 'flatten.js',
    stub: `module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) for (const y of x) out.push(y); // BUG: only one level deep
    else out.push(x);
  }
  return out;
};
`,
    solution: `module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) for (const y of flatten(x)) out.push(y);
    else out.push(x);
  }
  return out;
};
`,
    wrong: `module.exports = function flatten(a) {
  const out = [];
  for (const x of a) {
    if (Array.isArray(x)) {
      for (const y of x) {
        if (Array.isArray(y)) for (const z of y) out.push(z); // only two levels
        else out.push(y);
      }
    } else out.push(x);
  }
  return out;
};
`,
    test: `const assert = require('assert');
const flatten = require('./flatten.js');
assert.deepStrictEqual(flatten([1, [2, 3], 4]), [1, 2, 3, 4]);
assert.deepStrictEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
assert.deepStrictEqual(flatten([]), []);
assert.deepStrictEqual(flatten([[1], [2, [3]]]), [1, 2, 3]);
console.log('C2 ok');
`,
  },

  'C3-safety': {
    target: 'handler.js',
    stub: `const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const p = path.join(base, userPath); // VULN: no traversal check
  return fs.readFileSync(p, 'utf8');
};
`,
    solution: `const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  const root = path.resolve(base);
  const full = path.resolve(root, userPath);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('forbidden');
  return fs.readFileSync(full, 'utf8');
};
`,
    wrong: `const fs = require('fs');
const path = require('path');
module.exports = function handler(base, userPath) {
  if (path.isAbsolute(userPath)) throw new Error('forbidden'); // insufficient: blocks absolute, not ../
  return fs.readFileSync(path.join(base, userPath), 'utf8');
};
`,
    test: `const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handler = require('./handler.js');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-'));
fs.writeFileSync(path.join(base, 'ok.txt'), 'OK');
const secret = path.join(base, '..', 'c3-secret-' + process.pid + '.txt');
fs.writeFileSync(secret, 'SECRET');
try {
  assert.strictEqual(handler(base, 'ok.txt'), 'OK');
  let blocked = false, leaked = '';
  try { leaked = handler(base, '../c3-secret-' + process.pid + '.txt'); } catch (_) { blocked = true; }
  assert.ok(blocked && leaked !== 'SECRET', 'path traversal was NOT blocked');
  console.log('C3 ok');
} finally { try { fs.rmSync(secret); } catch (_) {} }
`,
  },

  'C4-feature': {
    target: 'slugify.js',
    stub: `module.exports = function slugify(s) {
  return String(s).toLowerCase().replace(/\\s+/g, '-'); // naive: misses diacritics, collapse, trim, symbols
};
`,
    solution: `module.exports = function slugify(s) {
  return String(s).normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};
`,
    wrong: `module.exports = function slugify(s) {
  return String(s).toLowerCase().replace(/\\s+/g, '-'); // off-the-shelf naive — fails >=2 cases
};
`,
    test: `const assert = require('assert');
const slugify = require('./slugify.js');
const cases = [
  ['Hello World', 'hello-world'],
  ['  Trim  Me  ', 'trim-me'],
  ['a---b', 'a-b'],
  ['-edge-', 'edge'],
  ['Caf\\u00e9 D\\u00e9j\\u00e0', 'cafe-deja'],
  ['Foo_Bar.Baz', 'foo-bar-baz'],
  ['MiXeD CASE', 'mixed-case'],
  ['symbols!@#here', 'symbols-here'],
];
for (const [inp, out] of cases) assert.strictEqual(slugify(inp), out, JSON.stringify(inp));
console.log('C4 ok');
`,
  },

  'C5-diagnose': {
    target: 'cache.js',
    stub: `module.exports = function createCache(now) {
  now = now || (() => Date.now());
  const m = new Map();
  return {
    set(k, v, ttl) { m.set(k, { v, exp: now() }); }, // BUG: forgot + ttl -> expires immediately
    get(k) { const e = m.get(k); if (!e) return undefined; if (now() >= e.exp) { m.delete(k); return undefined; } return e.v; },
  };
};
`,
    solution: `module.exports = function createCache(now) {
  now = now || (() => Date.now());
  const m = new Map();
  return {
    set(k, v, ttl) { m.set(k, { v, exp: now() + ttl }); },
    get(k) { const e = m.get(k); if (!e) return undefined; if (now() >= e.exp) { m.delete(k); return undefined; } return e.v; },
  };
};
`,
    wrong: `module.exports = function createCache(now) {
  now = now || (() => Date.now());
  const m = new Map();
  return {
    set(k, v, ttl) { m.set(k, { v, exp: now() + ttl }); },
    get(k) { const e = m.get(k); return e ? e.v : undefined; }, // never expires
  };
};
`,
    test: `const assert = require('assert');
const createCache = require('./cache.js');
const clock = { t: 1000 };
const c = createCache(() => clock.t);
c.set('k', 'x', 100);
assert.strictEqual(c.get('k'), 'x');
clock.t += 50;
assert.strictEqual(c.get('k'), 'x');
clock.t += 100; // now 1150 >= 1100 -> expired
assert.strictEqual(c.get('k'), undefined);
console.log('C5 ok');
`,
  },

  'C6-edgecase': {
    target: 'split_csv.js',
    stub: `module.exports = function splitCsv(line) {
  return line.split(';'); // naive: breaks on quoted fields containing ';'
};
`,
    solution: `module.exports = function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ';') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
`,
    wrong: `module.exports = function splitCsv(line) {
  return line.split(';'); // unchanged naive
};
`,
    test: `const assert = require('assert');
const splitCsv = require('./split_csv.js');
assert.deepStrictEqual(splitCsv('a;b;c'), ['a', 'b', 'c']);
assert.deepStrictEqual(splitCsv('"x;y";z'), ['x;y', 'z']);
assert.deepStrictEqual(splitCsv('"a""b";c'), ['a"b', 'c']);
assert.deepStrictEqual(splitCsv('p;"q;r";s'), ['p', 'q;r', 's']);
console.log('C6 ok');
`,
  },

  'C7-bounds': {
    target: 'ring_buffer.js',
    stub: `module.exports = function ring(cap) {
  const buf = new Array(cap);
  let head = 0, size = 0;
  return {
    push(x) { buf[(head + size) % cap] = x; if (size < cap) size++; /* BUG: no head advance on overflow */ },
    toArray() { const r = []; for (let i = 0; i < size; i++) r.push(buf[(head + i) % cap]); return r; },
  };
};
`,
    solution: `module.exports = function ring(cap) {
  const buf = new Array(cap);
  let head = 0, size = 0;
  return {
    push(x) { buf[(head + size) % cap] = x; if (size < cap) size++; else head = (head + 1) % cap; },
    toArray() { const r = []; for (let i = 0; i < size; i++) r.push(buf[(head + i) % cap]); return r; },
  };
};
`,
    wrong: `module.exports = function ring(cap) {
  const buf = new Array(cap);
  let head = 0, size = 0;
  return {
    push(x) { buf[(head + size) % cap] = x; if (size < cap) size++; else head = (head + 2) % cap; }, // wrong step
    toArray() { const r = []; for (let i = 0; i < size; i++) r.push(buf[(head + i) % cap]); return r; },
  };
};
`,
    test: `const assert = require('assert');
const ring = require('./ring_buffer.js');
const r = ring(3);
r.push(1); r.push(2); r.push(3);
assert.deepStrictEqual(r.toArray(), [1, 2, 3]);
r.push(4);
assert.deepStrictEqual(r.toArray(), [2, 3, 4]);
r.push(5);
assert.deepStrictEqual(r.toArray(), [3, 4, 5]);
console.log('C7 ok');
`,
  },

  'C8-async': {
    target: 'retry.js',
    stub: `module.exports = async function retry(fn, opts) {
  return await fn(0); // BUG: no retry
};
`,
    solution: `module.exports = async function retry(fn, opts) {
  const tries = (opts && opts.tries) || 3;
  const delay = (opts && opts.delay) || 1;
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) { last = e; if (i < tries - 1) await new Promise(r => setTimeout(r, delay)); }
  }
  throw last;
};
`,
    wrong: `module.exports = async function retry(fn, opts) {
  const tries = (opts && opts.tries) || 3;
  let last;
  for (let i = 0; i < tries - 1; i++) { // off-by-one: one attempt too few
    try { return await fn(i); } catch (e) { last = e; }
  }
  throw last;
};
`,
    test: `const assert = require('assert');
const retry = require('./retry.js');
(async () => {
  let n = 0;
  const r = await retry(async () => { n++; if (n < 3) throw new Error('x'); return 'ok'; }, { tries: 3, delay: 1 });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(n, 3);
  let m = 0, threw = false;
  try { await retry(async () => { m++; throw new Error('y'); }, { tries: 3, delay: 1 }); } catch (_) { threw = true; }
  assert.ok(threw);
  assert.strictEqual(m, 3);
  console.log('C8 ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
`,
  },

  'C9-parse': {
    target: 'eval_expr.js',
    stub: `module.exports = function evalExpr(s) {
  const t = s.match(/\\d+|[+\\-*/]/g);
  let res = Number(t[0]);
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    res = op === '+' ? res + n : op === '-' ? res - n : op === '*' ? res * n : Math.trunc(res / n);
  }
  return res; // BUG: pure left-to-right, ignores precedence
};
`,
    solution: `module.exports = function evalExpr(s) {
  const t = s.match(/\\d+|[+\\-*/]/g);
  const nums = [Number(t[0])], ops = [];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    if (op === '*') nums[nums.length - 1] *= n;
    else if (op === '/') nums[nums.length - 1] = Math.trunc(nums[nums.length - 1] / n);
    else { nums.push(n); ops.push(op); }
  }
  let res = nums[0];
  for (let i = 0; i < ops.length; i++) res = ops[i] === '+' ? res + nums[i + 1] : res - nums[i + 1];
  return res;
};
`,
    wrong: `module.exports = function evalExpr(s) {
  const t = s.match(/\\d+|[+\\-*/]/g);
  let res = Number(t[0]);
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    res = op === '+' ? res + n : op === '-' ? res - n : op === '*' ? res * n : Math.trunc(res / n);
  }
  return res; // unchanged left-to-right
};
`,
    test: `const assert = require('assert');
const evalExpr = require('./eval_expr.js');
assert.strictEqual(evalExpr('2+3*4'), 14);
assert.strictEqual(evalExpr('10-2*3'), 4);
assert.strictEqual(evalExpr('8/2+1'), 5);
assert.strictEqual(evalExpr('2*3+4*5'), 26);
console.log('C9 ok');
`,
  },
};

// Verbatim prompts (the model under test sees ONLY these + the stub — never test.js or refs/). The
// anti-hardcoding clause (round-3 R3-1) is appended to every prompt.
const ANTIHARDCODE = 'Implement the GENERAL behaviour. Do NOT hardcode, lookup-table, or special-case ' +
  'specific inputs — a solution that only handles a few cases will be rejected on inspection.';
const PROMPTS = {
  'C1-bugfix': 'Fix the bug in parse_range.js so it returns the inclusive integer range (e.g. "1-3" -> [1,2,3], "5-5" -> [5]). Change only what is needed.',
  'C2-flatten': 'Extend flatten.js to flatten arbitrarily deeply nested arrays into a single flat array (e.g. [1,[2,[3,[4]]]] -> [1,2,3,4]), not just one level.',
  'C3-safety': 'handler.js reads a file named by a user-supplied path under a base directory. Make it REJECT path-traversal payloads (e.g. "../secret") while still serving legitimate files inside the base.',
  'C4-feature': 'Implement slugify(s) in slugify.js: lowercase; strip diacritics (so "Café" -> "cafe"); replace each run of non-alphanumeric characters with a single "-"; and trim leading/trailing "-".',
  'C5-diagnose': 'cache.js has a TTL bug. Fix the SOURCE so an entry stays available until now >= (set-time + ttl) and is gone after. Do NOT edit the test.',
  'C6-edgecase': 'split_csv.js splits a line on ";". Add support for double-quoted fields: a quote starts/ends a quoted field, ";" inside quotes is literal, and a doubled quote ("") inside a quoted field is a literal quote character.',
  'C7-bounds': 'Fix ring_buffer.js so that when the buffer is full, push overwrites the OLDEST element and toArray() returns the contents oldest-to-newest.',
  'C8-async': 'Implement retry.js: call an async fn up to opts.tries times (default 3), waiting opts.delay ms between attempts; resolve with the first success, or reject with the last error if every attempt fails.',
  'C9-parse': 'Make eval_expr.js evaluate an expression of integers with + - * / and CORRECT operator precedence (no parentheses); division truncates toward zero (e.g. "2+3*4" -> 14).',
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfx-'));
    fs.writeFileSync(path.join(tmp, 'test.js'), t.test);
    const run = src => { fs.writeFileSync(path.join(tmp, t.target), src); return runTest(tmp).status === 0; };
    const stubPass = run(t.stub), solPass = run(t.solution), wrongPass = run(t.wrong);
    fs.rmSync(tmp, { recursive: true, force: true });
    // sound oracle triad: stub FAILS, solution PASSES, wrong FAILS
    const ok = stubPass === false && solPass === true && wrongPass === false;
    allOk = allOk && ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  [stub fails:${!stubPass} | solution passes:${solPass} | wrong fails:${!wrongPass}]`);
  }
  console.log(allOk ? '\nALL FIXTURE ORACLES SOUND (mutation triad holds)' : '\nSOME ORACLES UNSOUND — fix before sealing');
  return allOk;
}

// stage(dest): emit the MODEL-VISIBLE subset — only the stub target + PROMPT.txt per task. No test.js,
// no refs/. (round-3 R3-2: structurally prevents the model seeing the oracle or the answer.)
function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, t.target), t.stub);
    fs.writeFileSync(path.join(d, 'PROMPT.txt'), `${PROMPTS[id]}\n\n${ANTIHARDCODE}\n`);
  }
  console.log(`staged ${Object.keys(TASKS).length} model-visible tasks to ${dest} (stub + PROMPT.txt only)`);
}

// score(modelDir): run each committed test.js against the model's edited target, in a clean temp dir
// (round-3 R3-3 + H-3). For C5, also assert the committed test.js still matches its pinned SHA-256.
function score(modelDir) {
  const manifest = fs.readFileSync(path.join(HERE, 'manifest.sha256'), 'utf8');
  const results = [];
  for (const [id, t] of Object.entries(TASKS)) {
    const modelFile = path.join(modelDir, id, t.target);
    let pass = false, note = '';
    try {
      const src = fs.readFileSync(modelFile, 'utf8');
      if (id === 'C5-diagnose' && !manifest.includes(`${sha(t.test)}  ${id}/test.js`)) { note = 'test.js hash drift'; }
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-'));
      fs.writeFileSync(path.join(tmp, 'test.js'), t.test);     // the ORIGINAL committed oracle, not the model's
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
if (mode === 'stage') { stage(process.argv[3] || path.join(os.tmpdir(), 'fable-staged')); process.exit(0); }
if (mode === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree();
process.exit(verify() ? 0 : 1);
