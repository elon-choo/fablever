# Anti-overlap lens library

This file is the **human source of truth** for the lenses the recipes use. The
Workflow runtime has no filesystem access, so each recipe inlines a copy — keep
them conceptually in sync with this catalog.

## Why lenses exist (and why this file is load-bearing)

`divergent-explore` and the verify panel recover Fable's *breadth* by running
independent contexts that are each pointed at a **different failure mode or design
axis**, so they decorrelate instead of all converging on the same obvious answer
(model-collapse). The completeness critic flagged the honest catch:

> If picking the right lens set is itself open generation on a weak model, the
> "recognition beats generation" advantage evaporates.

So lenses are supplied as a **fixed menu you select from**, not something the
worker invents. Selection is classification ("which 5 of these apply?"), which a
weaker model does far more reliably than inventing orthogonal axes from scratch.

## Selection heuristic (recognition, not generation)

1. Identify the task genre: *verify an artifact* → use the **verify** menu;
   *explore an open problem* → use the **diverge** menu.
2. Pick the lenses whose description plausibly applies. Default to **5** (the
   `min(16, cores-2)` ceiling is the hard max; 5 is the sweet spot for cost).
3. If two lenses would find the same defect on this artifact, drop one — overlap
   buys nothing and costs an agent.
4. Only add a task-specific lens if a real failure mode is uncovered by the menu.
   Adding one bespoke lens to a mostly-recognized set is cheap; inventing all of
   them is the expensive path this menu exists to avoid.

## Verify menu (for adversarial-verify)

| key | failure mode it hunts |
|---|---|
| `correctness` | wrong results, off-by-one, broken invariants, mishandled inputs |
| `security` | injection, authz gaps, secret/credential exposure, unsafe deserialization |
| `edge_cases` | empty/null, concurrency, partial failure, resource exhaustion, timeouts |
| `consistency` | claims that contradict each other or the stated spec |
| `omission` | a required case/file/modality/step silently not handled |
| `overclaim` | "done/verified/safe" asserted with no evidence behind it |
| `cost` | wasted work, needless fan-out, token/latency blowups, over-building |

`contradiction`, `consistency`, and `omission` lenses are where fresh-context
independence pays off most. `correctness` deep-reasoning defects are partly
weights-bound — a weak skeptic catches fewer of them; do not over-claim the panel
closes that gap (see `docs/ORCHESTRATION-RESEARCH.md` §3.3).

## Diverge menu (for divergent-explore)

| key | angle it forces |
|---|---|
| `mvp-first` | simplest thing that could possibly work; minimal scope |
| `risk-first` | start from the biggest failure mode, design backwards |
| `user-first` | optimize the human experience / ergonomics |
| `cost-first` | minimize compute, token, latency, operational cost |
| `scale-first` | assume 100x load/data/users from day one |
| `constraint-first` | take the hardest constraint as fixed, build only what fits |
| `invert` | solve the dual problem, or design to avoid guaranteed failure |
| `analogy` | borrow a proven pattern from an adjacent domain |

## What lenses do NOT do

They recover the **spread** of distinct candidates. They do **not** raise the
quality ceiling of any single candidate — that lives in the worker's weights. Never
score divergence success by how *distinct* the outputs are (embedding-distance
dedup): distinct noise is still noise. Score recall against a pre-registered
reference set offline — see `eval/README.md`.
