class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  // Run middleware in registration order, then invoke `done` (the matched
  // handler). Each middleware is called as fn(req, next). Calling next()
  // continues the chain; a middleware that returns a response object (one with
  // a numeric `status`) WITHOUT calling next() short-circuits the chain.
  run(req, done) {
    const dispatch = (i) => {
      if (i >= this.fns.length) return done();
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
      if (ret && typeof ret.status === 'number') return ret;
      return ret;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
