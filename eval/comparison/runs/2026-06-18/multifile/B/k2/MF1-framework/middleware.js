class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, finalHandler) {
    const fns = this.fns;
    const dispatch = (i) => {
      if (i >= fns.length) return finalHandler(req);
      let nextCalled = false;
      let nextResult;
      const next = () => { nextCalled = true; nextResult = dispatch(i + 1); return nextResult; };
      const ret = fns[i](req, next);
      return nextCalled ? nextResult : ret;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
