class Chain {
  constructor() { this.fns = []; }
  use(fn) { this.fns.push(fn); }
}
module.exports = Chain;
