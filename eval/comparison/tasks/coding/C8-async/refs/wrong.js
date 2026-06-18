module.exports = async function retry(fn, opts) {
  const tries = (opts && opts.tries) || 3;
  let last;
  for (let i = 0; i < tries - 1; i++) { // off-by-one: one attempt too few
    try { return await fn(i); } catch (e) { last = e; }
  }
  throw last;
};
