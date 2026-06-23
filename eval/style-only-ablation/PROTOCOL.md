# Style-only ablation — PROTOCOL (committed BEFORE results)

**Question this answers (the #1 credibility risk):** is fablever's value real, or is it just "tell Claude
to be concise and verify" in a wrapper? To find out we compare the **safest install mode** (output style
only — no hooks, no MCP) against both plain Claude AND a generic concise/verify/scope prompt.

This file is written and committed *before* the run so the design can't be reverse-fit to the result
(anti-cherry-pick). Task set is frozen as `tasks.jsonl`; raw outputs and judgments are committed.

## Hypothesis

H1: fablever-style-only beats **baseline** (plain Claude) on failure-mode metrics — acceptance
completeness, unsupported-claim rate, scope compliance — without a meaningful concision/cost penalty.
H2 (the hard one): fablever-style-only also beats a **generic concise/verify/scope prompt** — i.e. the
value is a *persistent style layer*, not a one-off prompt you could type yourself.

We will report whatever the data shows, including a null/negative on H2 (a real possibility, and an
honest outcome that bounds the claim).

## Arms (all Opus 4.8, same base model, same tasks; baseline isolation per ../comparison/BASELINE-VALIDATION.md)

| arm | how it's instantiated | represents |
|---|---|---|
| **B** baseline | `outputStyle=default`, `FABLE_PROFILE=off`, plain task prompt | plain Claude Code |
| **G** generic | same as B, but the task prompt is prefixed with a generic "be concise, verify, don't over-do it" guidance | what a user could just type |
| **F** fable-style | `outputStyle=Fable`, `FABLE_PROFILE=''`, plain task prompt | fablever's safest install (style only) |

The channel difference (F applies via a persistent output style; G is typed into the prompt) **is** the
real-world comparison — fablever's pitch is "you don't retype it every turn." Noted, not hidden.

## Task set (frozen, `tasks.jsonl`) — 48 tasks, 6 domains × 8

research · doc-planning · code-bugfix · code-review (report-only) · scope-control (one-file / no-refactor /
report-only) · marketing-copy. The code-review + scope-control domains exist to measure **scope creep**
deterministically (did the model edit/patch when told only to report, or expand beyond the ask).

## Metrics

Primary (per arm, computed):
- **acceptance_pass** — INDEPENDENT oracle (Gemini-2.5-pro, NOT fablever's own `fable_check` gate, to avoid
  home-field advantage): is the deliverable complete + directly actionable for the task? (yes/no)
- **scope_compliance** — on report-only / scope-limited tasks: did it AVOID the forbidden action (proposing
  a fix when told to only report, expanding beyond the one file)? Deterministic regex on the output.
- **unsupported_claim_rate** — deterministic proxy: count of "done / works / fixed / verified / tested /
  correct" assertions not backed by a shown check/trace.
- **concision** — words per response. **cost proxy** — words (∝ output tokens).

Primary (blind, judged): forced-choice quality preference, Gemini-2.5-pro, both presentation orders
(order-inconsistent = position-bias tie), on pairs **F-vs-B**, **F-vs-G**, **G-vs-B**. Stats: exact
two-sided binomial sign test + Wilson 95% CI on the leading arm's share of decided pairs.

## Success criteria (declared up front)

- **F vs B (should clear easily):** blind win ≥ 60% of decided; acceptance ≥ +10pp; unsupported-claim
  materially lower; scope compliance ≥ B; concision not worse.
- **F vs G (the decisive test):** blind win ≥ 55% of decided, OR a clear, significant edge on scope
  compliance / acceptance. If F ≈ G, the honest conclusion is: *fablever is not magic over a good generic
  prompt — its value is making that discipline persistent and automatic, not retyped.*

## Reporting rule

Both H1 and H2 results published regardless of direction; raw per-task outputs in `raw/`, judgments in
`judge/`, tallies in `RESULTS.md` + `results.json`. Single judge model (one limitation); n=48 (modest).
