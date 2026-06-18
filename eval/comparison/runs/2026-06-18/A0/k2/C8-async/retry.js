module.exports = async function retry(fn, opts) {
  opts = opts || {};
  const tries = opts.tries != null ? opts.tries : 3;
  const delay = opts.delay != null ? opts.delay : 0;

  let lastError;

  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};
