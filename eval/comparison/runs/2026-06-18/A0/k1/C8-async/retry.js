module.exports = async function retry(fn, opts) {
  opts = opts || {};
  const tries = opts.tries ?? 3;
  const delay = opts.delay ?? 0;

  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < tries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};
