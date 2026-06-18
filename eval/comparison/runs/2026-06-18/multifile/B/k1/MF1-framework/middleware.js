class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  // Runs middleware in registration order, then `handler`. Each middleware is
  // called as fn(req, next); calling next() continues the chain. If a middleware
  // returns a response (numeric `status`) without calling next(), it short-circuits.
  run(req, handler) {
    const dispatch = (i) => {
      if (i >= this.fns.length) return handler(req);
      let nextCalled = false;
      let nextResult;
      const next = () => { nextCalled = true; nextResult = dispatch(i + 1); return nextResult; };
      const ret = this.fns[i](req, next);
      if (nextCalled) return nextResult;
      if (ret && typeof ret.status === 'number') return ret;
      return ret;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
