# Multi-turn developer-productivity A/B — plain Opus (A0) vs fablever (A1)

18 developer tasks, same base model (claude-opus-4-8), simulated interactive sessions capped at 4 assistant turns. A NEUTRAL, identical developer-policy reacts to each arm; the "complete?" oracle is **Gemini-2.5-pro (a different model), NOT fablever's own gate** (no home-field advantage). Baseline isolation in ../BASELINE-VALIDATION.md. Primary metric: assistant-turns to reach a done deliverable, paired per task (lower = fewer developer round-trips = more productive). Unresolved-within-cap scored as 5 turns.

## Primary — paired turns-to-done (which arm reached a shippable result in FEWER turns)
| metric | value |
|---|---|
| tasks fablever (A1) reached done in fewer turns | **3** |
| tasks plain Opus (A0) reached done in fewer turns | 7 |
| ties (same #turns) | 8 |
| decided | 10 |
| A1 win-% of decided | 30% |
| p (exact two-sided binomial sign test) | 0.3438 |
| 95% CI (Wilson, A1 share of decided) | [10.8, 60.3]% |

## Secondary
| metric | A0 (plain) | A1 (fablever) | direction |
|---|---|---|---|
| mean turns to done | 1.89 | 2.33 | lower = fewer round-trips |
| resolved within 4 turns | 100% | 88.9% | higher = reaches done |
| mean total assistant words read across session | 1113.5 | 1393.28 | lower = less reading to done |

By domain (A1-fewer / A0-fewer / tie): research 3/2/3 · doc-planning 0/4/3 · code 0/1/2.

**Reading:** this is the faithful test of fablever's productivity mechanism — it wins only when it reaches a CORRECT, complete result (per an independent oracle) in fewer developer round-trips. Contrast with the one-shot forced-choice in ../out (where plain Opus's extra scaffolding read as "less work" because a single response can't be charged for the round-trips it would trigger). Cluster = task; one oracle model. Both the one-shot (negative) and this multi-turn result are published — neither is cherry-picked.