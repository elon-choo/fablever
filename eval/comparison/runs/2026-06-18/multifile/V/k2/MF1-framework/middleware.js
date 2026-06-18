class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  // Run middleware in registration order, then the handler. Each middleware is
  // called as fn(req, next). Calling next() continues the chain (next middleware,
  // then the handler) and yields the downstream response. If a middleware does
  // NOT call next() and returns a response object (numeric `status`), that
  // response short-circuits the chain and the handler does not run.
  run(req, handler) {
    const dispatch = (i) => {
      if (i >= this.fns.length) return handler(req);
      const fn = this.fns[i];
      let nextCalled = false;
      let nextResult;
      const next = () => {
        nextCalled = true;
        nextResult = dispatch(i + 1);
        return nextResult;
      };
      const ret = fn(req, next);
      if (nextCalled) return nextResult;
      return ret;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
