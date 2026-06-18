class Router {
  constructor() { this.routes = []; }
  add(method, path, handler) { this.routes.push({ method, path, handler }); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const params = matchPath(r.path, path);
      if (params) return { handler: r.handler, params };
    }
    return null;
  }
}

function matchPath(routePath, path) {
  const routeSegs = routePath.split('/');
  const pathSegs = path.split('/');
  if (routeSegs.length !== pathSegs.length) return null;
  const params = {};
  for (let i = 0; i < routeSegs.length; i++) {
    const seg = routeSegs[i];
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = pathSegs[i];
    } else if (seg !== pathSegs[i]) {
      return null;
    }
  }
  return params;
}

module.exports = Router;
