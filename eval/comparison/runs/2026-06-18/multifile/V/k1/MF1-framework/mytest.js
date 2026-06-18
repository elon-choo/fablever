const assert = require('assert');
const App = require('./app');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ok -', name);
}

// ---- R1: single route param ----
check('R1 single param: /users/:id matches /users/42 -> params.id="42"', () => {
  const app = new App();
  let seen = null;
  app.get('/users/:id', (req) => { seen = req.params; return { status: 200, body: req.params.id }; });
  const res = app.handle({ method: 'GET', path: '/users/42' });
  assert.deepStrictEqual(seen, { id: '42' });
  assert.deepStrictEqual(res, { status: 200, body: '42' }); // R4: handler return is the response
});

// ---- R1b: multiple route params ----
check('R1b multiple params: /a/:x/b/:y matches /a/1/b/2 -> {x:"1",y:"2"}', () => {
  const app = new App();
  let seen = null;
  app.get('/a/:x/b/:y', (req) => { seen = req.params; return { status: 200 }; });
  app.handle({ method: 'GET', path: '/a/1/b/2' });
  assert.deepStrictEqual(seen, { x: '1', y: '2' });
});

// ---- R1c: static route still matches, params {} ----
check('R1c static route still works, params = {}', () => {
  const app = new App();
  let seen = 'unset';
  app.get('/health', (req) => { seen = req.params; return { status: 200, body: 'ok' }; });
  const res = app.handle({ method: 'GET', path: '/health' });
  assert.deepStrictEqual(seen, {});
  assert.deepStrictEqual(res, { status: 200, body: 'ok' });
});

// param route must NOT match a path of different segment length
check('R1d param route does not match shorter/longer path', () => {
  const app = new App();
  app.get('/users/:id', () => ({ status: 200 }));
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/users' }), { status: 404, body: 'Not Found' });
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/users/42/extra' }), { status: 404, body: 'Not Found' });
});

// ---- R2b/R2c: middleware run order + next() chaining to handler ----
check('R2b/R2c middleware run in registration order BEFORE handler via next()', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('mw1'); next(); });
  app.use((req, next) => { order.push('mw2'); next(); });
  app.get('/', (req) => { order.push('handler'); return { status: 200, body: 'done' }; });
  const res = app.handle({ method: 'GET', path: '/' });
  assert.deepStrictEqual(order, ['mw1', 'mw2', 'handler']);
  assert.deepStrictEqual(res, { status: 200, body: 'done' });
});

// middleware can mutate req that handler/later mw observe
check('R2c middleware mutations visible to later mw and handler', () => {
  const app = new App();
  app.use((req, next) => { req.user = 'alice'; next(); });
  app.get('/me', (req) => ({ status: 200, body: req.user }));
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/me' }), { status: 200, body: 'alice' });
});

// ---- R2d: middleware short-circuits WITHOUT calling next ----
check('R2d short-circuit: mw returns {status} w/o next -> handler & later mw skipped', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('mw1'); next(); });
  app.use((req, next) => { order.push('mw2-deny'); return { status: 401, body: 'Unauthorized' }; }); // no next()
  app.use((req, next) => { order.push('mw3'); next(); });
  app.get('/secret', (req) => { order.push('handler'); return { status: 200, body: 'secret' }; });
  const res = app.handle({ method: 'GET', path: '/secret' });
  assert.deepStrictEqual(res, { status: 401, body: 'Unauthorized' }); // short-circuit response is returned
  assert.deepStrictEqual(order, ['mw1', 'mw2-deny']); // mw3 and handler never ran
});

// a middleware that returns a status but DID call next does NOT short-circuit
check('R2d calling next() with a returned status still continues (no short-circuit)', () => {
  const app = new App();
  const order = [];
  app.use((req, next) => { order.push('mw1'); next(); return { status: 999 }; }); // next called -> ignore return
  app.get('/', (req) => { order.push('handler'); return { status: 200, body: 'ok' }; });
  const res = app.handle({ method: 'GET', path: '/' });
  assert.deepStrictEqual(order, ['mw1', 'handler']);
  assert.deepStrictEqual(res, { status: 200, body: 'ok' });
});

// ---- R3: method-aware 404 ----
check('R3 method-aware 404: right path wrong method -> 404', () => {
  const app = new App();
  app.get('/users/:id', (req) => ({ status: 200, body: req.params.id }));
  const res = app.handle({ method: 'POST', path: '/users/42' });
  assert.deepStrictEqual(res, { status: 404, body: 'Not Found' });
});

check('R3 unknown path -> 404', () => {
  const app = new App();
  app.get('/', () => ({ status: 200 }));
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/nope' }), { status: 404, body: 'Not Found' });
});

check('R3 POST route reachable only via POST (method dispatch)', () => {
  const app = new App();
  app.post('/items', (req) => ({ status: 201, body: 'created' }));
  assert.deepStrictEqual(app.handle({ method: 'POST', path: '/items' }), { status: 201, body: 'created' });
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/items' }), { status: 404, body: 'Not Found' });
});

// ---- R4: handler return value is the response (combined with params + mw) ----
check('R4 end-to-end: params + middleware + handler return', () => {
  const app = new App();
  app.use((req, next) => { req.tag = 'T'; next(); });
  app.get('/p/:a/q/:b', (req) => ({ status: 200, body: req.tag + ':' + req.params.a + req.params.b }));
  assert.deepStrictEqual(app.handle({ method: 'GET', path: '/p/x/q/y' }), { status: 200, body: 'T:xy' });
});

console.log(`\nAll ${passed} checks passed.`);
