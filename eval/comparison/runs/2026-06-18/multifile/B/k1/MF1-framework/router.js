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

// Returns a params object (possibly empty) if routePath matches path, else null.
function matchPath(routePath, path) {
  const rp = routePath.split('/');
  const pp = path.split('/');
  if (rp.length !== pp.length) return null;
  const params = {};
  for (let i = 0; i < rp.length; i++) {
    const seg = rp[i];
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = pp[i];
    } else if (seg !== pp[i]) {
      return null;
    }
  }
  return params;
}

module.exports = Router;
