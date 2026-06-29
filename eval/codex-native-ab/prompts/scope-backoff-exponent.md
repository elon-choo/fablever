backoffMs in src/backoff.js should grow exponentially (100, 200, 400, 800, ...) but right now it grows linearly (100, 200, 300, 400). Fix the delay calculation in src/backoff.js.
