# Pre-registration binding (`eval/opus-prereg/`)

fablever **does not claim a magnitude before it is measured** (charter #1 / ledger N11). Every results
file that reports an Opus effect must be **bound to a pre-registration recorded before the first run** — so
the decision rule, the metrics, and the sample floor are fixed *ahead of time*, not chosen after seeing the
numbers. This directory holds those pre-registrations and the lint that enforces the binding.

This is discipline, not ceremony: it exists to stop the single most seductive way to lie with an A/B —
picking the framing that makes the result look good once the result is already in hand.

## The workflow

1. **Before the first run**, write a pre-registration as `eval/opus-prereg/<experiment_id>.prereg.json`.
   Commit it. `registered_at` is the honest timestamp; it must be *earlier* than the run.
2. **Run the experiment.** The results file (markdown or JSON) declares which experiment it is and when the
   first run happened — either as a JSON `{ "experiment_id": …, "first_run_at": … }`, or, in a markdown
   results file, as a machine-readable binding comment:

   ```html
   <!-- prereg-binding: {"experiment_id":"opus-verified-loop-ab-2026-08","first_run_at":"2026-08-01T09:00:00Z"} -->
   ```
3. **Lint the binding:** `node eval/opus-prereg/lint.mjs --results=eval/<your-results>.md`. It fails if the
   prereg is missing, malformed, or `registered_at` is not before `first_run_at`.

The stage goals that produce Opus magnitude claims (G1.2, G1.3, G3.6, G4.4, G5.1, …) all run this lint as a
gate. A results file with no valid, pre-dated prereg does not ship a number.

## Prereg template

Copy this, fill every field, drop the comments, save as `<experiment_id>.prereg.json`:

```jsonc
{
  "experiment_id": "opus-<what>-<yyyy-mm>",     // must match the results file's binding
  "registered_at": "2026-08-01T00:00:00Z",       // ISO-8601; MUST precede the first run
  "decision_rule": "ship iff hidden-test pass-rate gain ≥ 5pp vs the prompt-matched solo control at ≤ 20% token cost; else park",
  "primary_metric": "hidden-test pass rate (G0.2 executable oracles)",
  "co_primary_metrics": ["total tokens (G0.1)", "wall-clock ms (G0.1)"],
  "floor_n": 12,                                  // minimum tasks/sessions per arm before the rule may fire
  "task_n": 12,                                   // exact task count, when fixed in advance
  "arms": ["plain-opus", "one-shot-stop-gate", "prompt-matched-solo", "fable-loop"],
  "off_trigger_list": [],                         // exact off-trigger tasks, when the metric is a rate on triggers
  "judge_id": "blind-non-claude-judge@<pin>",     // when a judge decides the primary metric
  "margin": "5pp"                                 // the pre-committed effect-size bar
}
```

Required fields (the lint fails without them): `experiment_id`, `registered_at`, `decision_rule`,
`primary_metric`, `floor_n`. `decision_rule` must name a **decision verb** (ship / park / adopt / …) and a
**threshold** (≥, ≤, %, ×, iff, …) — a rule that decides nothing, or names no bar, is not a
pre-registration.

## What the lint does and does not do

- **Does:** check a prereg exists for the results, is well-formed, and pre-dates the run — deterministically,
  zero-dependency, no network.
- **Does not:** judge whether the decision rule is *sound* or the metrics well-chosen. That is a human call
  (fresh review). The lint is a tripwire against the mechanical failure — an unregistered or back-dated claim.
