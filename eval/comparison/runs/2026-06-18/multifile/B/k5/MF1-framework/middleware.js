class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, handler) {
    const dispatch = (i) => {
      if (i === this.fns.length) return handler(req);
      let nextCalled = false;
      let nextResult;
      const next = () => { nextCalled = true; nextResult = dispatch(i + 1); return nextResult; };
      const result = this.fns[i](req, next);
      // If next() was called, the rest of the chain (and handler) already ran;
      // propagate its result. Otherwise a returned response short-circuits the chain.
      if (nextCalled) return nextResult;
      return result;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
