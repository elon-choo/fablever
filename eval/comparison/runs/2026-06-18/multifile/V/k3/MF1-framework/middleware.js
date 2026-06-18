class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  // Run middleware in registration order, then `terminal` (the matched handler
  // or the 404). Returns the final response, propagating the downstream value
  // through middleware that call next(). A middleware that returns a response
  // object (numeric `status`) WITHOUT calling next() short-circuits the chain.
  run(req, terminal) {
    const dispatch = (i) => {
      if (i >= this.fns.length) return terminal();
      const fn = this.fns[i];
      let called = false;
      let downstream;
      const next = () => {
        if (called) return downstream;
        called = true;
        downstream = dispatch(i + 1);
        return downstream;
      };
      const ret = fn(req, next);
      if (called) return downstream;
      // next() was not called.
      if (ret && typeof ret.status === 'number') return ret; // short-circuit
      return ret;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
