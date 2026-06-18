class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
  run(req, final) {
    let i = 0;
    const next = () => {
      if (i < this.fns.length) { const fn = this.fns[i++]; return fn(req, next); }
      return final(req);
    };
    return next();
  }
}
module.exports = Chain;
