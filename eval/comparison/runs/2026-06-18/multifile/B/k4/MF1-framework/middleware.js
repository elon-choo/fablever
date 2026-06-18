class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, handler) {
    const fns = this.fns;
    let i = 0;
    const dispatch = () => {
      if (i >= fns.length) return handler(req);
      const fn = fns[i++];
      let nextCalled = false;
      let nextResult;
      const next = () => { nextCalled = true; nextResult = dispatch(); return nextResult; };
      const ret = fn(req, next);
      // next() was called: response bubbles up from the rest of the chain.
      // Otherwise the middleware's own return value (a {status} response) short-circuits.
      return nextCalled ? nextResult : ret;
    };
    return dispatch();
  }
}
module.exports = Chain;
