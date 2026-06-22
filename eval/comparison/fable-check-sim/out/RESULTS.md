# fable_check — placebo-controlled A/B (deterministic delivery gate)

10 deliverable tasks across 5 domains, generated under the live Fable style. The gate fired (BLOCK) on **6/10** (60%). Active comparison is on those blocked tasks: **C** = raw draft, **T** = one revision guided by the gate's specific flags, **P** = one generic "make it excellent" revision (placebo, equal effort). Independent Gemini judge, 0-100, blind to arm, scored against held-out criteria the arms never saw.

## Judge scores on the blocked tasks (where the gate actually did something)
| arm | mean score | accept-rate % |
|---|---|---|
| C — raw draft | 95 | 100 |
| T — gate-guided revision | 95 | 100 |
| P — placebo generic revision | 95.5 | 100 |

**Lift T−C = 0** (does the gate improve the deliverable at all)
**Lift T−P = -0.5** (does the deterministic gate beat a generic second pass — the real question)
**Lift P−C = 0.5** (does any second pass help)

## Objective check (no judge): did the revision clear the gate?
- T (gate-guided): cleared on 66.7% of blocked tasks
- P (generic): incidentally cleared on 0% of blocked tasks

## Which tasks the gate blocked, and on what
- mkt1 (marketing-copy): M-cta
- mkt2 (marketing-copy): M-cta, M-rec
- fun1 (funnel-design): F-test
- fun2 (funnel-design): F-bottleneck, F-test
- res1 (research): R-overturn
- doc2 (doc-planning): D-decision

## All-tasks mean (incl. 4 the gate passed, where C=T=P)
C 95.3 · T 95.6 · P 95.6

Small-N pilot (cluster = task); directional, not powered for significance. The placebo arm is the guard the decision-trail study lacked: if T ≈ P, the value is "revise once more," not the gate mechanism; if T > P, the deterministic gate adds real signal a generic pass misses; if T ≈ C, the gate is inert.