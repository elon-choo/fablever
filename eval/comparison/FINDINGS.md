# fablever vs plain Opus — cross-axis findings (2026-06-18)

**Question asked:** find clear experimental evidence + metrics that fablever (Fable working style on Opus)
helps real work more than plain Opus.

**Honest answer from everything run: not found.** Across every objective and style metric I could automate
on Opus, fablever shows **no advantage** — parity on task success, and a small **cost** on
effort/verbosity. This is a well-earned null (multiple task sets, real runs), not a thin one.

## What was run, and what it showed

| axis | metric | result | verdict |
|---|---|---|---|
| Coding pass-rate (easy pool, 9 tasks) | executable test pass | A0 Haiku 27/27 → **saturated** | no discrimination possible |
| Coding pass-rate (hard pool, 9 textbook tasks) | executable test pass | 27/27 real solves → **saturated** | task-class ceiling for current models |
| Work-quality (6 maintenance tasks, Opus) | clean-success (do ask + no regression) | A0 6/6 vs **A1 6/6** | **no quality gap** |
| Efficiency (same, Opus) | turns / output tokens to clean | A0 4.7 turns / 1033 tok vs **A1 5.7 / 1608** | fablever **costs more** |
| Communication (manipulation check, Opus) | final-message length | A0 70 words vs **A1 92** | fablever **not terser** here |

(n is small — work-quality is k=1, n=6 — so the negatives are directional. But nothing across five metrics
points toward benefit; the only signals are parity or cost.)

## Why (and it's consistent with fablever's own honesty contract)
1. **Opus is already strong and disciplined.** On closed, well-specified tasks it is correct and does not
   over-build, so a working-*style* layer has no failure mode to fix. The objective metric ceilings in both
   arms.
2. **A style layer changes disposition/communication, not capability.** That is fablever's stated claim
   ("style transplant, not capability transplant"). A saturated objective metric is exactly what that
   predicts — the layer cannot move a number that is already at the top.
3. **The extra verification/output fablever induces is wasted motion when the outcome already ceilings** —
   hence the token/turn cost at parity quality.

## What a genuine positive result would require (and why I can't produce it solo)
The places a working-style advantage could plausibly live are **not** measurable by automated single-task
oracles:
- **Human ease/speed of acting** on a terse, outcome-first, decisive response vs a verbose one — a
  *human-side* metric (time-to-decision, rework requested). Needs human raters / a blind preference panel
  (PROTOCOL §4c, explicitly non-blind + ≥2 judges incl. a non-Claude one + human spot-check). I am Claude
  and cannot be that panel.
- **Open-ended / multi-session real work** where decisiveness and restraint change the *trajectory*, not a
  single closed answer. No deterministic oracle; needs human judgment of the end artifact.
- **Tasks at the edge of Opus's discipline** (messy, tempting-to-over-refactor) where plain Opus actually
  over-builds and fablever does not. The one automated regime not yet tested; promising but hard to build
  *fairly* (anti-tuning) and still likely small given how disciplined Opus is.

## Defensible claim the evidence DOES support
fablever installs the Fable working style on Opus **without degrading task success** (no-harm: parity on two
independent objective axes). The strengths the community praises (decisive low-narration action,
outcome-first, restraint, self-verification — see `community-reactions.md`) are real for the **Fable model**,
but those reactions bundle style with raw capability and cannot, by themselves, show the style *alone*
delivers an objective uplift on an already-strong model. On the evidence here, it does not.

## Status
Automated objective-metric search has **converged on null**. The remaining avenues (human-side eval; an
edge-of-discipline over-build task set) are a scope/cost decision for the operator — the first needs human
raters, the second needs more Opus runs with uncertain, likely-small payoff.
