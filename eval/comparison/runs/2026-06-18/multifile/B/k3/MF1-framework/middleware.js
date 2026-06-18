class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, finalHandler) {
    const dispatch = (i) => {
      if (i === this.fns.length) return finalHandler(req);
      let nextCalled = false;
      let nextResult;
      const next = () => { nextCalled = true; nextResult = dispatch(i + 1); return nextResult; };
      const ret = this.fns[i](req, next);
      if (nextCalled) return nextResult;
      if (ret && typeof ret.status === 'number') return ret;
      return nextResult;
    };
    return dispatch(0);
  }
}
module.exports = Chain;
