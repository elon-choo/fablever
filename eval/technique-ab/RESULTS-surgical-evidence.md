# Technique A/B — SURGICAL evidence loop (round 1): lighter packagings of the same idea

The full-rewrite evidence loop fixed its target metric but the GPT-5.5 judge preferred the leaner baseline 12–4 because it nearly doubled length. This round keeps the DIRECTION (no "done" without a shown check) and tests four lighter packagings, each head-to-head vs the same fablever baseline A, GPT-5.5 forced-choice both orders. Same 16 tasks, same deterministic metric.

**Baseline A:** unsupported-unbacked 25% · shows-evidence 37.5% · 210 words.

| packaging | unbacked↓ | shows-evidence↑ | words (vs A) | quality vs A (S–A) | round-1 read |
|---|---|---|---|---|---|
| **S1** inline (no 2nd call) | 12.5% | 62.5% | 103 (-51%) | 11–4 (p=0.1185) | PROMISING |
| **S2** surgical-patch | 18.8% | 50% | 225 (+7%) | 5–10 (p=0.3018) | PROMISING |
| **S3** capped-loop | 0% | 81.3% | 239 (+14%) | 6–6 (p=1) | PROMISING |
| **S4** label-only | 27.3% | 36.4% | 204 (-3%) | 2–8 (p=0.1094) | no-metric-gain |

*"quality vs A" = times the S arm was preferred over baseline A in order-consistent forced choice (ties = position bias). PROMISING = improves the evidence metric AND keeps length within +25% AND does not lose quality to A at p<0.10.*

## Round-1 read
Pick the packaging(s) that move the evidence metric without the length blow-up or the quality loss, then refine in round 2. The full rewrite is the known loser; these isolate which axis (front-loading vs scoping vs length-cap vs label-only) recovers the win.