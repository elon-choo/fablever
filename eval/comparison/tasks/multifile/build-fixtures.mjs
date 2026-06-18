// build-fixtures.mjs (MULTI-FILE axis) — the long-horizon regime where a PROCESS layer can plausibly beat
// plain Opus: several files + cross-file integration + a strict hidden acceptance suite. Neither arm sees
// the acceptance suite; the process arm must write its OWN tests. score() runs the hidden suite at the end.
//   node build-fixtures.mjs / verify / stage <dir> / score <dir>
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const TASKS = {
  'MF1-framework': {
    prompt: `This tiny web framework (app.js, router.js, middleware.js) is incomplete. Complete it so ALL of the following hold, keeping the existing class structure and exports:
1. ROUTE PARAMS: a route registered as '/users/:id' matches the path '/users/42', and the handler receives req.params = { id: '42' }. Support multiple params (e.g. '/a/:x/b/:y').
2. MIDDLEWARE: app.use(fn) registers middleware. On handle(req), middleware run in registration order BEFORE the matched handler. Each middleware is called as fn(req, next). Calling next() continues the chain (to the next middleware, then the handler). If a middleware returns a response object (one with a numeric \`status\`) WITHOUT calling next(), that response short-circuits the chain and the handler does NOT run.
3. METHOD-AWARE 404: if no route matches BOTH the method and the path, handle returns { status: 404, body: 'Not Found' }.
4. The matched handler's return value is the response from handle().`,
    files: {
      'router.js': `class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method === method && r.path === path) return { handler: r.handler, params: {} };
    }
    return null;
  }
}
module.exports = Router;
`,
      'middleware.js': `class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
}
module.exports = Chain;
`,
      'app.js': `const Router = require('./router');
const Chain = require('./middleware');
class App {
  constructor() { this.router = new Router(); this.chain = new Chain(); }
  use(fn) { this.chain.use(fn); }
  get(path, h) { this.router.add('GET', path, h); }
  post(path, h) { this.router.add('POST', path, h); }
  handle(req) {
    const m = this.router.match(req.method, req.path);
    if (!m) return { status: 404, body: 'Not Found' };
    return m.handler(req);
  }
}
module.exports = App;
`,
    },
    solution: {
      'router.js': `class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const rp = r.path.split('/'), pp = path.split('/');
      if (rp.length !== pp.length) continue;
      const params = {}; let ok = true;
      for (let i = 0; i < rp.length; i++) {
        if (rp[i].startsWith(':')) params[rp[i].slice(1)] = pp[i];
        else if (rp[i] !== pp[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}
module.exports = Router;
`,
      'middleware.js': `class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, final) {
    let i = 0;
    const next = () => {
      if (i < this.fns.length) { const fn = this.fns[i++]; return fn(req, next); }
      return final(req);
    };
    return next();
  }
}
module.exports = Chain;
`,
      'app.js': `const Router = require('./router');
const Chain = require('./middleware');
class App {
  constructor() { this.router = new Router(); this.chain = new Chain(); }
  use(fn) { this.chain.use(fn); }
  get(path, h) { this.router.add('GET', path, h); }
  post(path, h) { this.router.add('POST', path, h); }
  handle(req) {
    const m = this.router.match(req.method, req.path);
    if (!m) return { status: 404, body: 'Not Found' };
    req.params = m.params;
    return this.chain.run(req, () => m.handler(req));
  }
}
module.exports = App;
`,
    },
    accept: `const assert = require('assert');
const App = require('./app.js');
// 1. params
let app = new App();
app.get('/users/:id', req => ({ status: 200, body: req.params.id }));
assert.deepStrictEqual(app.handle({ method: 'GET', path: '/users/42' }), { status: 200, body: '42' });
app.get('/a/:x/b/:y', req => ({ status: 200, body: req.params.x + '-' + req.params.y }));
assert.strictEqual(app.handle({ method: 'GET', path: '/a/1/b/2' }).body, '1-2');
// 2. middleware order
app = new App(); const log = [];
app.use((req, next) => { log.push('m1'); return next(); });
app.use((req, next) => { log.push('m2'); return next(); });
app.get('/x', req => { log.push('h'); return { status: 200, body: 'ok' }; });
const r = app.handle({ method: 'GET', path: '/x' });
assert.deepStrictEqual(log, ['m1', 'm2', 'h']); assert.strictEqual(r.body, 'ok');
// short-circuit
app = new App(); let called = false;
app.use((req, next) => ({ status: 401, body: 'no' }));
app.get('/y', req => { called = true; return { status: 200 }; });
const r2 = app.handle({ method: 'GET', path: '/y' });
assert.strictEqual(r2.status, 401); assert.strictEqual(called, false, 'handler must not run when short-circuited');
// 3. method-aware 404
app = new App(); app.get('/z', req => ({ status: 200 }));
assert.strictEqual(app.handle({ method: 'POST', path: '/z' }).status, 404);
assert.strictEqual(app.handle({ method: 'GET', path: '/nope' }).status, 404);
console.log('MF1 ok');
`,
  },
};

const runAccept = dir => spawnSync(process.execPath, ['__accept.js'], { cwd: dir, encoding: 'utf8' });
function applyFiles(dir, files) { for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c); }

function writeTree() {
  for (const [id, t] of Object.entries(TASKS)) {
    const dir = path.join(HERE, id); fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
    applyFiles(dir, t.files); fs.writeFileSync(path.join(dir, '__accept.js'), t.accept);
    for (const [n, c] of Object.entries(t.solution)) fs.writeFileSync(path.join(dir, 'refs', n), c);
  } console.log('wrote ' + Object.keys(TASKS).length);
}
function verify() {
  let ok = true;
  for (const [id, t] of Object.entries(TASKS)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-')); fs.writeFileSync(path.join(tmp, '__accept.js'), t.accept);
    applyFiles(tmp, t.files); const startFail = runAccept(tmp).status !== 0;
    applyFiles(tmp, t.solution); const solPass = runAccept(tmp).status === 0;
    fs.rmSync(tmp, { recursive: true, force: true });
    const o = startFail && solPass; ok = ok && o;
    console.log(`${o ? 'PASS' : 'FAIL'}  ${id}  [start fails:${startFail} | solution passes:${solPass}]`);
  } console.log(ok ? 'SOUND' : 'UNSOUND'); return ok;
}
function stage(dest) {
  for (const [id, t] of Object.entries(TASKS)) {
    const d = path.join(dest, id); fs.mkdirSync(d, { recursive: true });
    applyFiles(d, t.files); fs.writeFileSync(path.join(d, 'PROMPT.txt'), t.prompt + '\n');
  } console.log('staged');
}
function score(modelDir) {
  const rows = [];
  for (const [id, t] of Object.entries(TASKS)) {
    let pass = false; const md = path.join(modelDir, id);
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-'));
      for (const n of Object.keys(t.files)) fs.copyFileSync(path.join(md, n), path.join(tmp, n)); // model's files
      fs.writeFileSync(path.join(tmp, '__accept.js'), t.accept); // hidden suite
      pass = runAccept(tmp).status === 0; fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {}
    rows.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}`);
  } console.log(`score: ${rows.filter(r => r.pass).length}/${rows.length}`); return rows;
}
const m = process.argv[2] || 'all';
if (m === 'verify') process.exit(verify() ? 0 : 1);
if (m === 'stage') { stage(process.argv[3]); process.exit(0); }
if (m === 'score') { score(process.argv[3] || '.'); process.exit(0); }
writeTree(); process.exit(verify() ? 0 : 1);
