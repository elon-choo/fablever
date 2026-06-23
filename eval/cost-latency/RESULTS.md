# Cost & latency — plain Opus (B) vs fablever style (F)

16 frozen tasks, same base model (claude-opus-4-8). Each call run with `--output-format json`; the `result` event's `usage`/`total_cost_usd`/`duration_ms` are recorded verbatim. No judge — pure measurement.

**Why two views.** 5 of 16 tasks fanned out into multi-turn tool loops on at least one arm (doc2: B=1t/F=5t, bug1: B=3t/F=3t, bug2: B=4t/F=1t, bug3: B=3t/F=1t, mkt1: B=1t/F=3t) — that agentic variance, not the style, dominates their tokens, and it hits **both** arms (plain ran the most turns on bug2/bug3). So the headline is the **single-turn subset (n=11)**, the clean apples-to-apples deliverable; the all-tasks means are shown too, with the caveat.

## Single-turn subset (clean comparison)
| metric | B (plain) | F (fablever) | read |
|---|---|---|---|
| output tokens — mean | 1396 | 1380 | ~neutral (F writes full sentences on short asks, trims long ones) |
| output tokens — median | 1637 | 1386 | F slightly lower |
| cost — mean (USD) | $0.1654 | $0.1893 | **F +14.45%** |
| cost — median (USD) | $0.1721 | $0.1882 | F higher |
| wall-clock — mean (ms) | 22686 | 22409 | – |
| cache-creation tokens | 8411 | 10718 | F writes a bigger system prompt |
| cache-read tokens | 15621 | 15636 | – |

- fablever emits **fewer** output tokens on **5/11** decided single-turn tasks — i.e. it is *not* a reliable token-saver.
- fablever is cheaper on **0/11** single-turn tasks — the style block (a measured **~2307 input tokens**) makes every single-shot call cost a bit more.

## All tasks (incl. multi-turn outliers — noisier)
| metric | B (plain) | F (fablever) |
|---|---|---|
| output tokens — mean / median | 1569 / 1684 | 2178 / 1447.5 |
| cost — mean / median (USD) | $0.195 / $0.1728 | $0.2574 / $0.1897 |

## Honest reading
fablever is **not** a cost or token saver. Output length is roughly neutral (it adds words on short asks, trims them on long ones), while the style block adds a fixed **~2307-token** system-prompt overhead — so single-shot calls cost about **14.45% more** (cheaper on 0/11). The honest mitigant is caching: that block is written **once per session** and then cache-*read* (~10× cheaper) on every later turn, so the per-call premium above — measured with a fresh cwd that re-writes the prompt every call — is the **worst-case** view; in a real multi-turn session the steady-state overhead is much smaller. Bottom line: a small, real, amortizing cost premium for the discipline layer — consistent with "style, not efficiency magic." Published as measured.