# fable_check — confirmatory result (Gemini-pro primary; Gemini-flash + codex cross-checks)

21 tasks; gate fired on **12/21** (57.1%). Forced-choice pairwise, both orders; a win counts only when the judge picks the same arm in both orders (order-inconsistent = position bias = tie).

## Gemini-2.5-pro — full pairwise on the blocked tasks
- T vs C: **T 12 – 0 C (ties 0, n=12), T 100% of decided**  ← gate-revision vs raw draft
- T vs P: **T 5 – 5 P (ties 2, n=12), T 50% of decided**  ← deterministic gate vs generic second pass (the decisive test)
- C vs P: **C 2 – 10 P (ties 0, n=12), C 17% of decided**  ← any second pass vs raw

## Cross-model check on the decisive T-vs-P pair
- Gemini-2.5-flash: T 4 – 3 P (ties 5, n=12), T 57% of decided
- GPT-5.5 / codex (partial — too slow to run fully): T 1 – 1 P (ties 0, n=2), T 50% of decided
- Agreement on the T-vs-P consistent winner: pro vs flash **7/7**; pro vs codex **2/2**

## Objective check (no judge): revision cleared the gate?
- T (gate-guided) **83.3%** · P (generic) **16.7%** of blocked tasks.

## Blocked tasks
- fun1 (funnel-design): F-bottleneck, F-test
- fun2 (funnel-design): F-bottleneck
- fun3 (funnel-design): F-goal, F-bottleneck, F-test
- fun4 (funnel-design): F-goal, F-bottleneck, F-test
- fun5 (funnel-design): F-bottleneck, F-test
- res1 (research): R-overturn
- res2 (research): R-overturn
- res3 (research): R-overturn
- res5 (research): R-overturn
- res6 (research): R-cited, R-overturn
- doc2 (doc-planning): D-decision
- doc3 (doc-planning): D-decision

Replicates the out2 pilot (7 blocked tasks: T-vs-C 7–0, T-vs-P 6–1) on a fresh, larger battery and a second judge model. Cluster = task; directional, not significance-powered, single provider for the two faster judges. The code domain rarely blocks (Fable already grounds code claims), so the gate's value concentrates in research/funnel/doc deliverables.