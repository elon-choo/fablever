# fable_check — pairwise forced-choice re-test (option 1)

16 deliverable tasks; gate fired on **7/16** (43.8%) after the marketing-check fix. On each blocked task, a demanding Gemini judge made FORCED-CHOICE pairwise picks (no ties, both presentation orders). A win counts ONLY when the judge picks the same arm in both orders; disagreement = position bias = tie.

## Order-consistent pairwise wins on blocked tasks
**T vs C** (n=7): T wins 7, C wins 0, order-bias ties 0.  Among decided: T 100% / C 0%  ← does the gate-guided revision beat the raw draft
**T vs P** (n=7): T wins 6, P wins 1, order-bias ties 0.  Among decided: T 86% / P 14%  ← **the real question: deterministic gate vs a generic second pass**
**C vs P** (n=7): C wins 0, P wins 7, order-bias ties 0.  Among decided: C 0% / P 100%  ← does any second pass beat the raw draft

## Objective check (no judge): did the revision clear the gate?
- T (gate-guided) cleared on 71.4% of blocked tasks; P (generic) on 14.3%.

## Which tasks blocked, and on what
- fun1 (funnel-design): F-bottleneck, F-test
- fun2 (funnel-design): F-bottleneck, F-test
- fun3 (funnel-design): F-goal, F-bottleneck, F-test
- res1 (research): R-overturn
- res2 (research): R-overturn
- res4 (research): R-cited, R-overturn
- doc2 (doc-planning): D-decision, D-nofab

## Per-pair detail
- fun1 TvC: T
- fun1 TvP: T
- fun1 CvP: P
- fun2 TvC: T
- fun2 TvP: T
- fun2 CvP: P
- fun3 TvC: T
- fun3 TvP: T
- fun3 CvP: P
- res1 TvC: T
- res1 TvP: T
- res1 CvP: P
- res2 TvC: T
- res2 TvP: T
- res2 CvP: P
- res4 TvC: T
- res4 TvP: T
- res4 CvP: P
- doc2 TvC: T
- doc2 TvP: P
- doc2 CvP: P

Small-N pilot (cluster = task); directional. Forced-choice + both-orders removes the absolute-score ceiling and controls position bias. If T beats C and P, the deterministic gate adds real signal a generic pass misses; if T ties C/P, the gate is not a quality lever even when applied perfectly.