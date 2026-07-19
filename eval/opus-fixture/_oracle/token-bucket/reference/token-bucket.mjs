export class TokenBucket {
  constructor({ capacity, refillPerSec }) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.lastNow = null;
  }

  tryRemove(now, n) {
    if (this.lastNow === null) {
      this.lastNow = now;
    } else {
      const elapsed = now - this.lastNow;
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsed * this.refillPerSec,
      );
      this.lastNow = now;
    }

    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}
