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
Task suite (frozen): <list of fixture task ids> + SHA-256 of fixtures/ (pin it)
Primary endpoint:  ONE, pre-declared (e.g. pooled a+b catch-rate). Everything else —
                   stratum c, divergent recall, precision, per-model breakdown — is
                   SECONDARY/exploratory under Holm or FDR correction, NOT a second
                   chance to find significance.
Sample size:       state target n per stratum from a power calc (min detectable effect,
                   chosen test). NOTE: the seed fixture (2 verify + 1 divergent task)
                   CANNOT reach p<0.05 under any paired test — it is a smoke fixture;
                   you must expand to the powered n before the decision rule applies.
Decision rule:     ship iff >= X-point gain on the PRIMARY endpoint at <= Y% cost AND
                   <= Z% wall-clock, replicated, paired across tasks, p < 0.05 (corrected)
Judge:             independent model, BLIND to condition; NOT the worker, NOT a
                   workflow sibling, NOT the fusion cross-model panel (all leak).
                   Prefer a NON-Claude judge for the headline (the Claude family shares
                   the same correlated blind spot the panel does).
Immutability:      commit the filled template + fixture hash to a DATED, pushed/tagged
                   commit BEFORE condition B runs. ab-harness SHOULD print the fixture
                   hash it ran against so the report is bound to the registration.
                   (NOTE: the shipped harness does not yet print this hash — EVAL-6;
                   pin and record it manually until instrumented.)
Strata reported:   (a) contradiction (b) omission (c) deep-reasoning, SEPARATELY
                   + task novelty (in-catalog vs out-of-catalog)
Null result:       allowed to falsify — if no gain, the recipe is dropped, not tuned
                   until it passes
```

No post-hoc metric selection. If you pick the metric after seeing the numbers, you
have measured nothing.

## Confounds this harness does NOT yet close (read before trusting any number)

The shipped `ab-harness.mjs` is a scaffold, not a finished instrument. A reviewer can
land every one of these today; each must be closed before a number is quoted. They are
listed here precisely so the number, when it comes, is not over-claimed.

- **Prompt/taxonomy asymmetry (ML-1 / EVAL-7).** Arm A gets one generic "list every
  defect" prompt; arm B gets five prompts each naming a specific lens. So arm B is handed
  the failure-mode *menu* arm A never sees, AND fresh context, AND the parallel barrier —
  all at once. A persistent gain therefore does **not** isolate "executed control-flow":
  it could be the lens taxonomy. **Closed in code (Round 2.5):** the prompt-matched arm
  `armA2` (one agent, all lenses, one context) now ships in `ab-harness.mjs`, so arm B's
  only addition over it is parallelism + independence. Note: until the A/B actually RUNS,
  the harness still only grounds the *weaker* claim ("context-isolation + decomposition
  help"), not the headline "executed control-flow, not prose."
- **Draw-count artifact (ML-4).** Arm B reports the UNION of N stochastic draws; arm A
  reports 1. More draws mechanically catch more, with zero structural benefit, and the
  artifact survives a model swap so it masquerades as a real gain. **Closed in code
  (Round 2.5):** the draw-matched control `armA_N` (one generic prompt sampled N times,
  union) now ships, so the panel is compared against the same number of draws.
- **Nominal blinding (EVAL-3).** The X/Y label swap hides the arm *name*, but the panel
  union is longer and stylistically heterogeneous vs the single agent, so a judge can
  infer the condition from surface form. **Required:** normalize both arms to a common
  post-processed format (dedupe, cap length, strip per-lens framing) before the judge,
  or run a "judge guesses the arm" probe and show it is at chance.
- **Fixture circularity (EVAL-5).** Defects are hand-authored, stratum-labeled, and shown
  to the judge verbatim, and `fixtures/_README` pre-declares which strata should win — the
  fixture encodes the hypothesis. **Required:** source a fraction of defects independently
  (real bug-fix commits / CVEs, or planted by someone blind to the recipes); move the
  expected-outcome note out of the scored artifact; report author-planted vs
  independently-sourced separately.
- **Cost is not measured (COST-3 / COST-4).** The decision rule makes tokens AND
  wall-clock load-bearing, but the shipped harness captures NEITHER — its only denominator
  is a constant agent count the caller already knew. Arm B is structurally ~5× the agents
  of arm A, so any recall win is reportable without its cost multiplier. **Required:**
  instrument per-arm wall-clock and token/usage (or, if the runtime does not expose usage,
  say so and demote the token clause to an explicit estimate), and report a
  cost-normalized primary metric (defects-caught-per-agent / per-1k-tokens) so a 5×-agent
  arm must clear a 5×-higher bar.
- **Cost-direction is not established by mechanism (COST-6).** Mechanism argues panels
  *decorrelate* blind spots; it does **not** argue the decorrelated catch is one a strong
  solo pass would miss, nor that the panel wins *per unit cost*. It is entirely possible
  the panel only matches solo at higher cost. Nothing shipped rules this out until the A/B
  (with cost instrumentation) and the premise-control both run.

## Hard predecessors (run these BEFORE the first measurement)

1. **Premise-reproduction control** — `premise-control.md`. Confirm the Fable-over-
   Opus orchestration gap reproduces under *matched* `ultracode` + context before
   building a library to close it. The whole effort rests on one uncontrolled
   anecdote; if the gap was a harness-setting confound, you are chasing a phantom.
2. **Hook exemption** — `../orchestration/HOOK-EXEMPTION-PROPOSAL.md`. The restraint
   payload must stop reaching orchestration workers before you measure them, or
   condition B is contaminated toward "structure didn't help." `ab-harness.mjs`
   refuses to run unless the caller passes `hookExemptionConfirmed:true` — an
   honor-system flag; it does NOT itself verify the live SubagentStart payload (EVAL-8/H2).

## Metrics: numerators vs denominators

- **Numerators (success):** defect-catch-rate per stratum; reference-set **recall**
  for divergence (judge-scored against `fixtures/`, never embedding-distance dedup).
- **Denominators (cost + reward-hack tripwires, NEVER headline):** agent count,
  fan-out width, gates-fired, tokens, **and wall-clock-to-first-useful-output.** An
  upgrade that doubles agents or quadruples latency for a 5% quality gain is a
  regression, not a win. **Status:** today the harness only emits agent count — tokens
  and wall-clock are NOT yet captured (see "Confounds" → COST-3). The token/latency
  clauses of the decision rule are therefore un-enforceable until the harness is
  instrumented; treat them as required-before-shipping, not as already-measured.

## Gate-integrity check (closes the RED-gate hole)

Seed an artifact with a planted defect, then verify the RED gate does **not**
false-pass when the orchestrator spawns a single hollow rubber-stamp skeptic. If a
token-skeptic can satisfy the gate, score that as a gate failure. The gate is honest
only once this specific game is measured and shown not to occur.

## Files

- `premise-control.md` — the position-zero control protocol.
- `fixtures/seeded-defects.json` — planted defects stratified a/b/c + a divergent
  reference-set example. Ground truth for catch-rate and recall.
- `ab-harness.mjs` — launchable Workflow that runs **four arms** (baseline, prompt-matched
  control, draw-matched control, panel) with a fixed worker, an independent blind judge, and
  an **agent-count-normalized** `caught_per_agent` (tokens/wall-clock are NOT captured — the
  runtime exposes neither `Date.now` nor usage, so capture them at the call site; COST-3).
  The apples-to-apples per-agent comparison holds only between **agent-count-matched** arms
  (panel vs draw-matched; baseline vs prompt-matched); across the 1-agent vs N-agent arms,
  read raw recall alongside the agent count, not the per-agent ratio.
