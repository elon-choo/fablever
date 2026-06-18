const assert = require('assert');
const App = require('./app');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ok -', name);
}

// ---------------------------------------------------------------------------
// Req 1: ROUTE PARAMS — single param
// ---------------------------------------------------------------------------
check('single route param /users/:id matches /users/42', () => {
  const app = new App();
  let seen = null;
  app.get('/users/:id', (req) => { seen = req.params; return { status: 200, body: req.params.id }; });
  const res = app.handle({ method: 'GET', path: '/users/42' });
  assert.deepStrictEqual(seen, { id: '42' });
  assert.deepStrictEqual(res, { status: 200, body: '42' });
});

// Req 1 (edge): multiple route params
check('multiple route params /a/:x/b/:y', () => {
  const app = new App();
  let seen = null;
  app.get('/a/:x/b/:y', (req) => { seen = req.params; return { status: 200 }; });
  app.handle({ method: 'GET', path: '/a/1/b/2' });
  assert.deepStrictEqual(seen, { x: '1', y: '2' });
});

// Req 1 (edge): static segment between params must still match literally
check('param route does not over-match different static segment', () => {
  const app = new App();
  app.get('/a/:x/b/:y', () => ({ status: 200 }));
  // path has 'c' where route expects literal 'b' -> no match -> 404
  const res = app.handle({ method: 'GET', path: '/a/1/c/2' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

// Req 1 (edge): different segment count must not match
check('segment-count mismatch does not match', () => {
  const app = new App();
  app.get('/users/:id', () => ({ status: 200 }));
  const res = app.handle({ method: 'GET', path: '/users/42/extra' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

// ---------------------------------------------------------------------------
// Req 2: MIDDLEWARE — registration order, fn(req,next), next() continues
// ---------------------------------------------------------------------------
check('middleware run in registration order before handler', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('m1'); next(); });
  app.use((req, next) => { order.push('m2'); next(); });
  app.get('/', (req) => { order.push('handler'); return { status: 200 }; });
  const res = app.handle({ method: 'GET', path: '/' });
  assert.deepStrictEqual(order, ['m1', 'm2', 'handler']);
  assert.deepStrictEqual(res, { status: 200 });
});

check('middleware called as fn(req, next) and can mutate req', () => {
  const app = new App();
  app.use((req, next) => { req.user = 'alice'; next(); });
  app.get('/me', (req) => ({ status: 200, body: req.user }));
  const res = app.handle({ method: 'GET', path: '/me' });
  assert.deepStrictEqual(res, { status: 200, body: 'alice' });
});

// Req 2 (edge): short-circuit — middleware returns response WITHOUT next(), handler skipped
check('middleware short-circuits without calling next; handler does NOT run', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('m1'); next(); });
  app.use((req, next) => { order.push('auth'); return { status: 401, body: 'Unauthorized' }; }); // no next()
  app.use((req, next) => { order.push('m3'); next(); });
  app.get('/secret', (req) => { order.push('handler'); return { status: 200, body: 'secret' }; });
  const res = app.handle({ method: 'GET', path: '/secret' });
  assert.deepStrictEqual(res, { status: 401, body: 'Unauthorized' });
  // m3 and handler must NOT have run
  assert.deepStrictEqual(order, ['m1', 'auth']);
});

// Req 2 (edge): a middleware that calls next() then returns — downstream result wins
check('downstream result propagates when middleware returns next()', () => {
  const app = new App();
  app.use((req, next) => next());
  app.get('/x', () => ({ status: 200, body: 'handler-value' }));
  const res = app.handle({ method: 'GET', path: '/x' });
  assert.deepStrictEqual(res, { status: 200, body: 'handler-value' });
});

// Req 2 (combined with params): middleware sees req.params too
check('middleware sees req.params set from route match', () => {
  const app = new App();
  let seenInMw = null;
  app.use((req, next) => { seenInMw = req.params; next(); });
  app.get('/users/:id', (req) => ({ status: 200 }));
  app.handle({ method: 'GET', path: '/users/99' });
  assert.deepStrictEqual(seenInMw, { id: '99' });
});

// ---------------------------------------------------------------------------
// Req 3: METHOD-AWARE 404
// ---------------------------------------------------------------------------
check('no matching path -> 404', () => {
  const app = new App();
  app.get('/', () => ({ status: 200 }));
  const res = app.handle({ method: 'GET', path: '/nope' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

check('path matches but method does NOT -> 404 (method-aware)', () => {
  const app = new App();
  app.post('/users/:id', () => ({ status: 201 }));
  // GET on a path only registered for POST must 404, not match
  const res = app.handle({ method: 'GET', path: '/users/42' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

check('correct method on same path still matches', () => {
  const app = new App();
  app.get('/users/:id', (req) => ({ status: 200, body: 'get' }));
  app.post('/users/:id', (req) => ({ status: 201, body: 'post' }));
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/users/7' }), { status: 200, body: 'get' });
  assert.deepStrictEqual(app.handle({ method: 'POST', path: '/users/7' }), { status: 201, body: 'post' });
});

// 404 short-circuit must not run middleware-bound handler (handler never registered)
check('404 returned even when middleware registered', () => {
  const app = new App();
  let mwRan = false;
  app.use((req, next) => { mwRan = true; next(); });
  const res = app.handle({ method: 'GET', path: '/missing' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
  assert.strictEqual(mwRan, false); // no match -> chain not run
});

// ---------------------------------------------------------------------------
// Req 4: handler return value is the response from handle()
// ---------------------------------------------------------------------------
check('handler return value is the response (with no middleware)', () => {
  const app = new App();
  const payload = { status: 200, body: { hello: 'world' }, custom: true };
  app.get('/echo', () => payload);
  const res = app.handle({ method: 'GET', path: '/echo' });
  assert.strictEqual(res, payload); // identity: exact return value passes through
});

console.log(`\nAll ${passed} checks passed.`);
