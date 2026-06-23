# Technique A/B — TASK-TYPE ROUTING (the #1 upgrade): route discipline, don't apply it uniformly

Tests the headline upgrade-research claim (and fablize's `router.sh` pattern): inject a heavy discipline only for the task type that needs it, not on every task. A=baseline, B=always-on (all 3 disciplines every task), C=routed (keyword classifier picks the one discipline; simple tasks get none). 15 tasks across confirm/build/debug/simple. GPT-5.5 forced choice, both orders.

**Routing accuracy:** 93.3% of tasks classified to the intended discipline.

| arm | mean words (all) | mean words (SIMPLE tasks) |
|---|---|---|
| A baseline | 156 | 36 |
| B always-on | 177 | 51 |
| **C routed** | 138 | 50 |

**C vs A (routed vs baseline):** C won **8–3** of 11 (72.7%, p=0.2266); 4 ties.
**C vs B (routed vs always-on):** C won **6–9** of 15 (40%, p=0.6072); 0 ties.

## Verdict — a BOUNDED NULL: routing is leaner, but does NOT beat always-on on single-shot quality

Routing (C) is **~22% leaner than always-on** (138 vs 177 words) and trends above the bare baseline (C vs A
**8–3**, n.s.) — but it **does not beat always-on on quality** (C vs B **6–9**, p=0.61, n.s.). The reason is the
finding that matters: **in a single shot, always-on heavy discipline is *cheap* — the model simply ignores
the disciplines that don't fit the task** (injecting all three onto "write `add(a,b)`" still produced a short
function; B on simple tasks averaged 51 words, barely above routed's 50). So uniform application isn't the
quality disaster the cost number suggested; its only measured penalty here is length.

**Why this is a *bounded* null, not a refutation of routing.** A single-shot A/B cannot see the cost that
actually motivates routing: **context accumulation over a long session** — every always-on injection,
repeated across dozens of turns, is the "harness paradox" `fablize` names (verification noise crowding
long-session attention). That cost is invisible at n=1 turn and only shows in a longitudinal **out-of-band
holdout** (upgrade #7). So this result *relocates* routing's case: its single-shot value is **cost/leanness,
not quality**, and its quality case — if any — lives in long sessions this harness can't simulate. The honest
read: **don't headline task-routing as a quality win; its proven benefit is leanness, and the real test is the
holdout measurement, not a single-shot A/B.** Independent GPT-5.5 judge; n=15, routing accuracy 93.3% (one
confirm task misrouted to investigation by a "crashes" keyword — a realistic router miss, kept as-is).