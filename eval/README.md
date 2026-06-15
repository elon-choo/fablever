# Eval — earning the right to claim a number

The orchestration recipes are justified by **mechanism** (see
`docs/ORCHESTRATION-RESEARCH.md`). Their **magnitude** is unverified. This folder is
how a claim like "the verify panel catches X% more defects" becomes shippable
instead of placebo. Nothing in the recipe layer may advertise a quantitative gain
until the harness here shows a **replicated, judge-scored gain at non-degraded cost.**

## The one inversion that answers the placebo objection

> If toggling a prompt changes results, that is evidence of placebo or broken
> scaffolding, not of a real gain.

The discriminator: **structure-driven gains persist under a worker-model swap;
prose-driven gains vanish on toggle.** So every A/B holds the worker model fixed and
ablates the *structure* (single mega-agent vs decomposed+parallel+verify), then
re-runs across Opus, Sonnet, and Haiku as the worker. A real recipe helps all three;
a placebo helps none once the wording stops being novel.

## Pre-registration template (fill BEFORE running condition B)

```
Hypothesis:        e.g. "adversarial-verify raises contradiction/omission catch-rate"
Task suite (frozen): <list of fixture task ids>
Primary metric:    <one; e.g. defect-catch-rate on strata a+b>
Decision rule:     ship iff >= X-point gain at <= Y% token cost AND <= Z% wall-clock,
                   replicated, paired-test across tasks, p < 0.05
Judge:             independent model, BLIND to condition; NOT the worker, NOT a
                   workflow sibling, NOT the fusion cross-model panel (all leak)
Strata reported:   (a) contradiction (b) omission (c) deep-reasoning, SEPARATELY
                   + task novelty (in-catalog vs out-of-catalog)
Null result:       allowed to falsify — if no gain, the recipe is dropped, not tuned
                   until it passes
```

No post-hoc metric selection. If you pick the metric after seeing the numbers, you
have measured nothing.

## Hard predecessors (run these BEFORE the first measurement)

1. **Premise-reproduction control** — `premise-control.md`. Confirm the Fable-over-
   Opus orchestration gap reproduces under *matched* `ultracode` + context before
   building a library to close it. The whole effort rests on one uncontrolled
   anecdote; if the gap was a harness-setting confound, you are chasing a phantom.
2. **Hook exemption** — `../orchestration/HOOK-EXEMPTION-PROPOSAL.md`. The restraint
   payload must stop reaching orchestration workers before you measure them, or
   condition B is contaminated toward "structure didn't help." `ab-harness.mjs`
   refuses to run if it detects the payload would reach a skeptic.

## Metrics: numerators vs denominators

- **Numerators (success):** defect-catch-rate per stratum; reference-set **recall**
  for divergence (judge-scored against `fixtures/`, never embedding-distance dedup).
- **Denominators (cost + reward-hack tripwires, NEVER headline):** agent count,
  fan-out width, gates-fired, tokens, **and wall-clock-to-first-useful-output.** An
  upgrade that doubles agents or quadruples latency for a 5% quality gain is a
  regression, not a win.

## Gate-integrity check (closes the RED-gate hole)

Seed an artifact with a planted defect, then verify the RED gate does **not**
false-pass when the orchestrator spawns a single hollow rubber-stamp skeptic. If a
token-skeptic can satisfy the gate, score that as a gate failure. The gate is honest
only once this specific game is measured and shown not to occur.

## Files

- `premise-control.md` — the position-zero control protocol.
- `fixtures/seeded-defects.json` — planted defects stratified a/b/c + a divergent
  reference-set example. Ground truth for catch-rate and recall.
- `ab-harness.mjs` — launchable Workflow that runs both arms with a fixed worker,
  an independent blind judge, and the cost/latency/agent denominators.
