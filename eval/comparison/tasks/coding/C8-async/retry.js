module.exports = async function retry(fn, opts) {
  return await fn(0); // BUG: no retry
};
