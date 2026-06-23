# Developer-productivity A/B — plain Opus (A0) vs fablever (A1)

30 developer tasks (research 12, doc-planning 12, code 6), same base model (claude-opus-4-8), same prompts. Baseline isolation proven in ../BASELINE-VALIDATION.md. Productivity forced-choice (Gemini-2.5-pro): "which gets YOU to a shippable result with the least follow-up, back-and-forth, re-reading, rework, and cleanup." Both presentation orders; order-inconsistent = position bias = tie. Win-% is of decided (non-tie) pairs; p = exact two-sided binomial sign test vs 50/50; CI = Wilson 95% on the leading arm.

## Primary — productivity preference
| comparison | wins | decided n | win-% | p (two-sided) | 95% CI | what it isolates |
|---|---|---|---|---|---|---|
| A1g vs A0 | 1–3 (ties 26) | 4 | 25% | 0.625 | [4.6, 69.9]% | **real product** (style + gate) vs plain Opus |
| A1s vs A0 | 1–9 (ties 20) | 10 | 10% | 0.0215 | [1.8, 40.4]% | style ALONE, same # of passes, vs plain Opus |

## Objective proxies (no judge) — the mechanism, measured directly
| metric | A0 (plain) | A1s (style) | A1g (real product) | direction |
|---|---|---|---|---|
| acceptance-complete on first delivery | 46.7% | 63.3% | 100% | higher = less rework round-trip |
| mean words the developer must read | 510.23 | 516 | 595.5 | lower = less reading (if complete) |
| ends-on / asks-permission rate | 43.3% | 6.7% | 6.7% | lower = fewer wasted round-trips |
| mean over-build markers / response | 0 | 0.07 | 0.07 | lower = less unrequested cleanup |

Gate fired (BLOCKed the one-shot fablever draft) on 11/30 tasks — that is where A1g diverges from A1s. Cluster = task; one judge. **Honest framing:** A1g vs A0 is the real product (fablever automatically does the gate-check + revision the developer would otherwise have to request — that "free" pass IS the productivity mechanism). A1s vs A0 controls for pass-count by giving both arms one shot, isolating the style's own contribution. Read p<0.05 with CI above 50% as a real productivity edge; a CI spanning 50% as no detectable edge on that axis. Published whatever it shows — this is the productivity A/B the repo previously listed as unmet.

## What this means (honest reading — the result went AGAINST fablever)

This was designed to give fablever its best fair shot (mechanism-wheelhouse tasks, a productivity-framed
judge, the full style+gate product allowed). It still did **not** show a one-shot developer-productivity
advantage:

- **Style alone loses, significantly:** on the same-number-of-passes comparison, plain Opus was preferred
  **9–1** among decided pairs (p = 0.02). The gate closes the gap to a tie (A1g vs A0: 1–3, 26 ties,
  n.s.) but produces **no positive edge**.
- **Why (from the judge's own rationales):** a developer receiving a *single* response with no chance to
  follow up values exactly the scaffolding fablever strips — summary tables, "next steps" / "practical
  guidance" sections, phased checklists, named fallbacks. The judge repeatedly said the *more* scaffolded
  plain-Opus answer *"saved me a follow-up question,"* was an *"immediately actionable artifact,"* and cost
  *"less work to synthesize."* fablever's restraint, a virtue inside a live agent loop, is a net negative
  for a one-shot deliverable the human must act on alone.
- **Where fablever does measurably win (objective, no judge):** it asks for permission / ends on a question
  **6.7% vs 43.3%** of the time (~6.5× fewer round-trips), and its first draft is acceptance-complete more
  often (style-only **63.3% vs 46.7%**; gated **100%** — the 100% is partly by construction, since A1g is
  the gate-passing revision). Neither converted into a one-shot preference, because this format cannot
  charge plain Opus for the round-trips its 43% permission-asks would cost in a real interaction.

**Key caveat — the instrument is misaligned with the mechanism.** fablever's productivity thesis is about
*interactive, multi-turn* agent work (fewer wasted turns and less reading accumulated across a session). A
single-shot forced-choice on one response structurally rewards a maximally-complete one-shot artifact —
the opposite of restraint — so it cannot capture that mechanism. Read this as: **fablever does not make a
single hand-off deliverable more productive to receive (it slightly hurts), which is consistent with the
repo's standing "style transplant, not a one-shot quality booster" position.** A faithful test of the
productivity claim needs a *multi-turn* task where plain Opus's round-trips actually cost the developer
time — that experiment has not been run here, and this negative one-shot result stays on the record either way.