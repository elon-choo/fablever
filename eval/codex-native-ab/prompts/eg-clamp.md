src/x.js has a clamp(n, lo, hi) helper that should clamp n to the inclusive range [lo, hi], but values above hi come back unclamped (clamp(42, 0, 10) returns 42). Fix it.
