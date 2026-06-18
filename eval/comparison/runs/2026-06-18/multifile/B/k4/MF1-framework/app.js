const Router = require('./router');
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
    return this.chain.run(req, m.handler);
  }
}
module.exports = App;
