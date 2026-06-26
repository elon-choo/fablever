// measurement/lib/stats.mjs — small, dependency-free, SEEDED statistics for the holdout read-out.
//
// The existing analyze.mjs gives a quick directional read; for a campaign read-out we want effect sizes and
// uncertainty, not a single mean. These are deliberately non-parametric (small, skewed session samples):
// a seeded bootstrap CI of the mean difference, a seeded permutation p-value, Cliff's delta (effect size),
// and Holm correction across the primary outcomes. Seeded (mulberry32) so a read-out is reproducible —
// re-running on the same ledger yields the same numbers. Zero dependencies.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function resample(arr, rng) { const out = new Array(arr.length); for (let i = 0; i < arr.length; i++) out[i] = arr[(rng() * arr.length) | 0]; return out; }
function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } }

// Bootstrap CI of (mean(a) - mean(b)). Returns { point, lo, hi } at the given confidence.
export function bootstrapDiffCI(a, b, { iters = 2000, seed = 12345, conf = 0.95 } = {}) {
  if (!a.length || !b.length) return { point: null, lo: null, hi: null };
  const rng = mulberry32(seed);
  const point = mean(a) - mean(b);
  const diffs = [];
  for (let i = 0; i < iters; i++) diffs.push(mean(resample(a, rng)) - mean(resample(b, rng)));
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.max(0, Math.floor(((1 - conf) / 2) * iters))];
  const hi = diffs[Math.min(iters - 1, Math.floor(((1 + conf) / 2) * iters) - 1)];
  return { point, lo, hi };
}

// Two-sided permutation p-value for a difference in means (label-shuffle). Add-one smoothed.
export function permutationP(a, b, { iters = 2000, seed = 999 } = {}) {
  if (!a.length || !b.length) return null;
  const obs = Math.abs(mean(a) - mean(b));
  const pooled = a.concat(b); const na = a.length;
  const rng = mulberry32(seed);
  let ge = 0;
  for (let i = 0; i < iters; i++) {
    shuffle(pooled, rng);
    if (Math.abs(mean(pooled.slice(0, na)) - mean(pooled.slice(na))) >= obs - 1e-12) ge++;
  }
  return (ge + 1) / (iters + 1);
}

// Cliff's delta effect size with the usual magnitude bands.
export function cliffsDelta(a, b) {
  if (!a.length || !b.length) return { delta: null, mag: 'n/a' };
  let gt = 0, lt = 0;
  for (const x of a) for (const y of b) { if (x > y) gt++; else if (x < y) lt++; }
  const d = (gt - lt) / (a.length * b.length);
  const ad = Math.abs(d);
  const mag = ad < 0.147 ? 'negligible' : ad < 0.33 ? 'small' : ad < 0.474 ? 'medium' : 'large';
  return { delta: d, mag };
}

// Holm step-down adjustment of a p-value array (returns adjusted p's, same order as input).
export function holm(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const adj = new Array(m); let prev = 0;
  for (let k = 0; k < m; k++) {
    const [p, i] = order[k];
    const a = Math.max(prev, Math.min(1, (m - k) * p));
    adj[i] = a; prev = a;
  }
  return adj;
}
