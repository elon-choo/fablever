class Router {
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
