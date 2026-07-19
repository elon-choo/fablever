Implement `TokenBucket` in `scaffold/token-bucket.mjs`.

The module must export:

```js
export class TokenBucket {
  constructor({ capacity, refillPerSec });
  tryRemove(now, n);
}
```

`now` is a monotonic time in seconds and may be fractional. A new bucket starts
full. Before each removal attempt, add the tokens earned since the previous
attempt, but never let the balance exceed `capacity`.

`tryRemove(now, n)` returns `true` and removes `n` tokens when enough are
available. Otherwise it returns `false` without changing the available balance.
Fractional refill amounts must work.
