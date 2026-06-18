class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    const pathParts = path.split('/');
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const routeParts = r.path.split('/');
      if (routeParts.length !== pathParts.length) continue;
      const params = {};
      let matched = true;
      for (let i = 0; i < routeParts.length; i++) {
        const rp = routeParts[i];
        if (rp.startsWith(':')) {
          params[rp.slice(1)] = pathParts[i];
        } else if (rp !== pathParts[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: r.handler, params };
    }
    return null;
  }
}
module.exports = Router;
