class Router {
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
