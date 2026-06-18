const assert = require('assert');
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
