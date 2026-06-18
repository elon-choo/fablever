module.exports = async function retry(fn, opts) {
  const tries = (opts && opts.tries) || 3;
  const delay = (opts && opts.delay) || 1;
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) { last = e; if (i < tries - 1) await new Promise(r => setTimeout(r, delay)); }
  }
  throw last;
};
