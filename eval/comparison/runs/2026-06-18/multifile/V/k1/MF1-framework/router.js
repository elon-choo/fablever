class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    const reqParts = path.split('/');
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const routeParts = r.path.split('/');
      if (routeParts.length !== reqParts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < routeParts.length; i++) {
        const seg = routeParts[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = reqParts[i];
        } else if (seg !== reqParts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}
module.exports = Router;
