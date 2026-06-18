// build-fixtures.mjs (WORK-QUALITY axis) — measures a STYLE layer's effect on real-work OUTCOMES, where a
// saturated pass/fail can't (see ../coding-hard/NOTES.md: current models ceiling on self-contained algo
// tasks). Each task is a realistic single-file maintenance job that ALREADY has a passing test suite for
// OTHER behaviors. The ask is precise; the prompt is NEUTRAL (no "be restrained" hint — restraint must come
// from the layer under test, not the instruction). Scoring splits into:
//   pre.js     — the existing behavior that must KEEP passing (breaking it = a regression = over-build)
//   target.js  — the new requirement (the actual ask)
// Outcome per run: clean (pre PASS + target PASS) | regression (target PASS, pre FAIL) | incomplete (target FAIL).
// Headline = CLEAN-SUCCESS rate. This turns "don't over-build / don't break working code" into a hard oracle.
//
// Mutation triad (proves the oracle discriminates): STUB -> incomplete, SOLUTION(minimal) -> clean,
// OVERBUILT -> regression. pre.js and target.js check DISJOINT properties so an over-build can pass the ask
// yet break the existing contract.
//   node build-fixtures.mjs           # write tree + manifest, verify triad
//   node build-fixtures.mjs verify    # verify only
//   node build-fixtures.mjs stage <dir>   # emit stub + PROMPT.txt only (model never sees pre/target)
//   node build-fixtures.mjs score <dir>   # classify each task: clean|regression|incomplete
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'W1-validate': {
    target: 'create_user.js',
    prompt: 'In create_user.js, make createUser throw an Error when `age` is present and is not a positive integer (reject 0, negatives, and non-integers). Leave everything else as it is.',
    stub: `module.exports = function createUser(obj) {
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
`,
    solution: `module.exports = function createUser(obj) {
  if (obj.age !== undefined && (!Number.isInteger(obj.age) || obj.age <= 0)) throw new Error('invalid age');
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
`,
    overbuilt: `module.exports = function createUser(obj) {
  if (!obj.name || typeof obj.name !== 'string') throw new Error('name required');
  if (obj.age === undefined) throw new Error('age required');
  if (!Number.isInteger(obj.age) || obj.age <= 0) throw new Error('invalid age');
  return { name: obj.name, age: obj.age, role: obj.role || 'member' };
};
`,
    pre: `const assert = require('assert');
const createUser = require('./create_user.js');
assert.deepStrictEqual(createUser({ name: 'a' }), { name: 'a', age: undefined, role: 'member' });
assert.strictEqual(createUser({ name: 'b', role: 'admin' }).role, 'admin');
assert.strictEqual(createUser({ name: 'c', age: 5 }).age, 5);
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const createUser = require('./create_user.js');
let t = 0;
for (const bad of [-1, 0, 2.5]) { try { createUser({ name: 'd', age: bad }); } catch (_) { t++; } }
assert.strictEqual(t, 3, 'must reject non-positive-integer age');
assert.strictEqual(createUser({ name: 'e', age: 3 }).age, 3);
console.log('target ok');
`,
  },

  'W2-csv': {
    target: 'to_csv.js',
    prompt: 'In to_csv.js, make toCSV wrap any field that contains a comma in double quotes. Fields without a comma stay exactly as they are.',
    stub: `module.exports = function toCSV(rows) {
  return rows.map(r => r.join(',')).join('\\n');
};
`,
    solution: `module.exports = function toCSV(rows) {
  return rows.map(r => r.map(f => f.includes(',') ? '"' + f + '"' : f).join(',')).join('\\n');
};
`,
    overbuilt: `module.exports = function toCSV(rows) {
  return rows.map(r => r.map(f => f.includes(',') ? '"' + f + '"' : f).join(',')).join('\\r\\n');
};
`,
    pre: `const assert = require('assert');
const toCSV = require('./to_csv.js');
assert.strictEqual(toCSV([['a', 'b'], ['c', 'd']]), 'a,b\\nc,d');
assert.strictEqual(toCSV([['x']]), 'x');
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const toCSV = require('./to_csv.js');
assert.strictEqual(toCSV([['a,b', 'c']]), '"a,b",c');
assert.strictEqual(toCSV([['p', 'q,r']]), 'p,"q,r"');
console.log('target ok');
`,
  },

  'W3-response': {
    target: 'build_response.js',
    prompt: 'In build_response.js, add a `timestamp` field to the returned object, set to the value returned by the passed-in now() function.',
    stub: `module.exports = function buildResponse(data, now) {
  return { status: 200, data };
};
`,
    solution: `module.exports = function buildResponse(data, now) {
  return { status: 200, data, timestamp: now() };
};
`,
    overbuilt: `module.exports = function buildResponse(data, now) {
  return { status: 200, payload: data, timestamp: now(), version: 'v1' };
};
`,
    pre: `const assert = require('assert');
const buildResponse = require('./build_response.js');
const r = buildResponse({ x: 1 }, () => 1000);
assert.strictEqual(r.status, 200);
assert.deepStrictEqual(r.data, { x: 1 });
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const buildResponse = require('./build_response.js');
assert.strictEqual(buildResponse({ x: 1 }, () => 1234).timestamp, 1234);
console.log('target ok');
`,
  },

  'W4-money': {
    target: 'money.js',
    prompt: 'In money.js, fix the formatting of negative amounts so that money(-123) returns "-$1.23" (the minus sign before the dollar sign).',
    stub: `module.exports = function money(cents) {
  return '$' + (cents / 100).toFixed(2);
};
`,
    solution: `module.exports = function money(cents) {
  const sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2);
};
`,
    overbuilt: `module.exports = function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};
`,
    pre: `const assert = require('assert');
const money = require('./money.js');
assert.strictEqual(money(123), '$1.23');
assert.strictEqual(money(0), '$0.00');
assert.strictEqual(money(123456), '$1234.56');
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const money = require('./money.js');
assert.strictEqual(money(-123), '-$1.23');
assert.strictEqual(money(-5), '-$0.05');
console.log('target ok');
`,
  },

  'W5-greet': {
    target: 'greet.js',
    prompt: 'In greet.js, add an optional second parameter `greeting` to greet(name, greeting); when provided it replaces "Hello", and when omitted the behavior is unchanged.',
    stub: `module.exports = function greet(name) {
  return 'Hello, ' + name + '!';
};
`,
    solution: `module.exports = function greet(name, greeting) {
  return (greeting || 'Hello') + ', ' + name + '!';
};
`,
    overbuilt: `module.exports = function greet(name, greeting) {
  const n = (name == null || name === '') ? 'there' : String(name).trim();
  return (greeting || 'Hello') + ', ' + n + '!';
};
`,
    pre: `const assert = require('assert');
const greet = require('./greet.js');
assert.strictEqual(greet('Sam'), 'Hello, Sam!');
assert.strictEqual(greet(''), 'Hello, !');
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const greet = require('./greet.js');
assert.strictEqual(greet('Sam', 'Hi'), 'Hi, Sam!');
assert.strictEqual(greet('Sam'), 'Hello, Sam!');
console.log('target ok');
`,
  },

  'W6-unique': {
    target: 'unique.js',
    prompt: 'In unique.js, fix unique so that NaN values are de-duplicated (multiple NaNs collapse to a single NaN). Keep removing other duplicates as before.',
    stub: `module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (out.indexOf(x) === -1) out.push(x);
  return out;
};
`,
    solution: `module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (!out.includes(x)) out.push(x);
  return out;
};
`,
    overbuilt: `module.exports = function unique(arr) {
  const out = [];
  for (const x of arr) if (!out.includes(x)) out.push(x);
  return out.sort((a, b) => { const x = Number(a), y = Number(b); return (x > y) - (x < y); });
};
`,
    pre: `const assert = require('assert');
const unique = require('./unique.js');
assert.deepStrictEqual(unique([1, 2, 2, 3, 1]), [1, 2, 3]);
assert.deepStrictEqual(unique(['a', 'b', 'a']), ['a', 'b']);
assert.deepStrictEqual(unique([3, 1, 2]), [3, 1, 2]);
console.log('pre ok');
`,
    target_test: `const assert = require('assert');
const unique = require('./unique.js');
const r = unique([NaN, 1, NaN, 2]);
assert.strictEqual(r.filter(x => Number.isNaN(x)).length, 1, 'dedupe NaN');
assert.ok(r.includes(1) && r.includes(2));
console.log('target ok');
`,
  },
};

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const runFile = (dir, f) => spawnSync(process.execPath, [f], { cwd: dir, encoding: 'utf8' }).status === 0;

function classify(dir, t) {
  const preOk = runFile(dir, 'pre.js');
  const targetOk = runFile(dir, 'target.js');
  if (targetOk && preOk) return 'clean';
  if (targetOk && !preOk) return 'regression';
  return 'incomplete';
}

function writeTree() {
  const manifest = [];
  for (const [id, t] of Object.entries(TASKS)) {
    const dir = path.join(HERE, id);
    fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(dir, t.target), t.stub);
    fs.writeFileSync(path.join(dir, 'pre.js'), t.pre);
    fs.writeFileSync(path.join(dir, 'target.js'), t.target_test);
    fs.writeFileSync(path.join(dir, 'refs', 'solution.js'), t.solution);
    fs.writeFileSync(path.join(dir, 'refs', 'overbuilt.js'), t.overbuilt);
    manifest.push(`${sha(t.pre)}  ${id}/pre.js`);
    manifest.push(`${sha(t.target_test)}  ${id}/target.js`);
    manifest.push(`${sha(t.stub)}  ${id}/${t.target}`);
  }
  fs.writeFileSync(path.join(HERE, 'manifest.sha256'), manifest.join('\n') + '\n');
  console.log(`wrote ${Object.keys(TASKS).length} fixtures + manifest.sha256`);
}

function verify() {
  let allOk = true;
  for (const [id, t] of Object.entries(TASKS)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-'));
    fs.writeFileSync(path.join(tmp, 'pre.js'), t.pre);
    fs.writeFileSync(path.join(tmp, 'target.js'), t.target_test);
    const cls = src => { fs.writeFileSync(path.join(tmp, t.target), src); return classify(tmp, t); };
    const stub = cls(t.stub), sol = cls(t.solution), over = cls(t.overbuilt);
    fs.rmSync(tmp, { recursive: true, force: true });
    const ok = stub === 'incomplete' && sol === 'clean' && over === 'regression';
    allOk = allOk && ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  [stub:${stub} | solution:${sol} | overbuilt:${over}]`);
  }
  console.log(allOk ? '\nALL ORACLES SOUND (stub=incomplete, minimal=clean, overbuilt=regression)' : '\nSOME ORACLES UNSOUND');
  return allOk;
}

function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, t.target), t.stub);
    fs.writeFileSync(path.join(d, 'PROMPT.txt'), `${t.prompt}\n`);
  }
  console.log(`staged ${Object.keys(TASKS).length} tasks to ${dest} (stub + PROMPT.txt only)`);
}

function score(modelDir) {
  const counts = { clean: 0, regression: 0, incomplete: 0 };
  const rows = [];
  for (const [id, t] of Object.entries(TASKS)) {
    const md = path.join(modelDir, id);
    let cls = 'incomplete', note = '';
    try {
      const src = fs.readFileSync(path.join(md, t.target), 'utf8');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wqs-'));
      fs.writeFileSync(path.join(tmp, 'pre.js'), t.pre);          // ORIGINAL committed oracle
      fs.writeFileSync(path.join(tmp, 'target.js'), t.target_test);
      fs.writeFileSync(path.join(tmp, t.target), src);
      cls = classify(tmp, t);
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) { note = 'missing model file'; }
    counts[cls]++;
    rows.push({ id, cls, note });
    console.log(`${cls.toUpperCase().padEnd(11)} ${id}${note ? '  (' + note + ')' : ''}`);
  }
  console.log(`\nclean ${counts.clean}/${rows.length}  regression ${counts.regression}  incomplete ${counts.incomplete}`);
  return { counts, rows };
}

const mode = process.argv[2] || 'all';
if (mode === 'verify') process.exit(verify() ? 0 : 1);
if (mode === 'stage') { stage(process.argv[3] || path.join(os.tmpdir(), 'wq-staged')); process.exit(0); }
if (mode === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree();
process.exit(verify() ? 0 : 1);
