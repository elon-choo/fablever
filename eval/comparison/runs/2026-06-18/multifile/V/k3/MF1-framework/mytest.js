#!/usr/bin/env node
// Self-test exercising every requirement in PROMPT.txt, including edge cases.
const assert = require('assert');
const App = require('./app');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

// --- Req 1a: single route param ---
check('route param: /users/:id matches /users/42 with req.params.id', () => {
  const app = new App();
  let seen;
  app.get('/users/:id', (req) => { seen = req.params; return { status: 200, body: req.params.id }; });
  const res = app.handle({ method: 'GET', path: '/users/42' });
  assert.deepStrictEqual(seen, { id: '42' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, '42');
});

// --- Req 1b: multiple route params ---
check('multiple params: /a/:x/b/:y -> {x,y}', () => {
  const app = new App();
  let seen;
  app.get('/a/:x/b/:y', (req) => { seen = req.params; return { status: 200, body: 'ok' }; });
  app.handle({ method: 'GET', path: '/a/1/b/2' });
  assert.deepStrictEqual(seen, { x: '1', y: '2' });
});

// --- Req 1c: static routes still work; params route doesn't over-match wrong length ---
check('static route still matches and has empty params', () => {
  const app = new App();
  let seen = 'unset';
  app.get('/health', (req) => { seen = req.params; return { status: 200, body: 'up' }; });
  const res = app.handle({ method: 'GET', path: '/health' });
  assert.deepStrictEqual(seen, {});
  assert.strictEqual(res.body, 'up');
});

check('param route does NOT match a path of different segment length', () => {
  const app = new App();
  app.get('/users/:id', () => ({ status: 200, body: 'x' }));
  const res = app.handle({ method: 'GET', path: '/users/42/extra' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

// --- Req 2b/2c: middleware run in registration order BEFORE handler ---
check('middleware run in registration order before handler', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('m1'); return next(); });
  app.use((req, next) => { order.push('m2'); return next(); });
  app.get('/', (req) => { order.push('handler'); return { status: 200, body: 'done' }; });
  const res = app.handle({ method: 'GET', path: '/' });
  assert.deepStrictEqual(order, ['m1', 'm2', 'handler']);
  assert.strictEqual(res.body, 'done');
});

// --- Req 2c (edge): middleware that calls next() but RETURNS NOTHING must still
//     propagate the downstream handler's return value as the final response ---
check('next() propagates downstream return even if middleware returns undefined', () => {
  const app = new App();
  app.use((req, next) => { req.tag = 'tagged'; next(); }); // no return
  app.get('/', (req) => ({ status: 201, body: req.tag }));
  const res = app.handle({ method: 'GET', path: '/' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body, 'tagged'); // mutation visible to handler too
});

// --- Req 2d: short-circuit without calling next() ---
check('middleware short-circuits with status response, handler NOT run', () => {
  const app = new App();
  let handlerRan = false;
  app.use((req, next) => ({ status: 401, body: 'Unauthorized' })); // no next()
  app.use((req, next) => { handlerRan = 'm2'; return next(); }); // must not run
  app.get('/', (req) => { handlerRan = true; return { status: 200, body: 'secret' }; });
  const res = app.handle({ method: 'GET', path: '/' });
  assert.deepStrictEqual(res, { status: 401, body: 'Unauthorized' });
  assert.strictEqual(handlerRan, false);
});

// --- Req 3: method-aware 404 (path exists, wrong method) ---
check('method-aware 404: right path, wrong method', () => {
  const app = new App();
  app.get('/users/:id', () => ({ status: 200, body: 'ok' }));
  const res = app.handle({ method: 'POST', path: '/users/42' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

check('404 for unknown path', () => {
  const app = new App();
  app.get('/', () => ({ status: 200, body: 'ok' }));
  const res = app.handle({ method: 'GET', path: '/nope' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

// --- Req 4: handler return value is the response (post route + params combined) ---
check('handler return value is the response from handle (POST + params)', () => {
  const app = new App();
  app.post('/items/:itemId', (req) => ({ status: 200, body: 'created:' + req.params.itemId }));
  const res = app.handle({ method: 'POST', path: '/items/abc' });
  assert.deepStrictEqual(res, { status: 200, body: 'created:abc' });
});

console.log('\nAll ' + passed + ' checks passed.');
