class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const params = this._matchPath(r.path, path);
      if (params) return { handler: r.handler, params };
    }
    return null;
  }
  _matchPath(routePath, path) {
    const rp = routePath.split('/');
    const pp = path.split('/');
    if (rp.length !== pp.length) return null;
    const params = {};
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) {
        params[rp[i].slice(1)] = pp[i];
      } else if (rp[i] !== pp[i]) {
        return null;
      }
    }
    return params;
  }
}
module.exports = Router;
