# Human-preference experiment design — how to gather defensible evidence that people prefer fablever

This is the **prep spec** for the battery that backs the published claim with measured, rebuttal-resistant
evidence. It says exactly what to run, what to measure, what to predict, and which design feature defuses each
likely rebuttal. It deliberately uses ONLY the levers that survived measurement and drops the one that did not.

## What we claim — and what we explicitly do NOT claim
- **CLAIM (defensible):** fablever does not change *what* Opus produces (correctness is identical — proven
  across 7 saturated task classes) or *how many tokens it spends*. It changes **how the answer is delivered to
  a human asking for help**, and in the *advice / Q&A regime* that delivery is genuinely preferred for getting
  work done: answer-first, decisive, no padding, no invented detail.
- **DO NOT CLAIM:** "words drop to <half / tool-use multiplies." Measured FALSE for fablever-on-Opus on agentic
  coding transcripts (A1 = 103–129% of A0 words, tool:text ≈ 1.0×). That is the native Fable-5 *model*'s
  property, not the transplanted style. See `video-claims-audit.md`. Using it invites a 5-minute refutation.
- **DO NOT CLAIM:** the style makes Opus "more honest / stop lying" as a *differential* effect. Plain Opus
  already self-verifies; task success is at parity. The defect-catching is the **optional cross-model verify
  arm**, not the style.

Scope discipline is the point: a narrow claim that is *true* draws fewer rebuttals than a broad claim that is
*falsifiable*.

## Two satisfaction axes, operationalized so each is measurable
People "prefer working with X" for two separable reasons. We measure both, but only with proxies that hold up.

### Axis 1 — OUTPUT satisfaction (the answer they receive)
Primary, strongest, already positive. Regime = **human-facing advice/Q&A** (the human reads the whole reply),
NOT agentic task transcripts (where the leanness claim is false).
- **Pairwise preference** (primary): blind judge picks "which reply would the busy asker rather receive?"
- **Objective delivery proxies** (already measured, hold in this regime): mean words (A1 −12% to −18%),
  filler-opener rate (A1 0% vs A0 8%), markdown-scaffold density (headers 0.4 vs 3.1, bullets 1.6 vs 3.9).
  These describe *form*, are computed mechanically, and are reproducible from the captured `.txt` responses.

### Axis 2 — PROCESS satisfaction (what it feels like to work with)
A style layer cannot honestly claim "faster / fewer tokens" on short tasks (proven: same-or-more). So we do
NOT use throughput. Instead we measure the felt-experience dimensions the judge already flagged, each one
mechanically or rubric-scorable and each one a thing users actively dislike when absent:
- **Answer-position / time-to-answer**: token index of the first actionable imperative or recommendation.
  fablever leads with it; plain Opus often buries it after preamble/options. (Lower = less scrolling = less
  friction.) Mechanical proxy: index of first imperative-mood sentence or "use/do/run X" recommendation.
- **Decisiveness rate**: fraction of replies that give a *single* recommendation vs surveying N options and
  leaving the choice to the user. Proxy: hedge/survey-phrase count ("it depends," "both have," "several
  options," "on the other hand") — already in `hv-run.mjs` proxies — plus a judge yes/no "did it commit to a
  recommendation?"
- **No-invented-detail / fabrication rate** (the strongest honest process signal): does the reply invent repo
  specifics, file names, APIs, or constraints the asker never gave? Users distrust and must re-verify made-up
  detail. Judge rubric: count fabricated specifics per reply. The blind judge *already* cited "no invented
  repo context" as a recurring reason to prefer fablever — this turns that into a counted metric.
- **Mental-discard burden**: padding the reader skips. Proxy: filler-openers + scaffold density (above).

## Core design (the rigor that makes it hard to rebut)
1. **Blind, position-balanced pairwise judging.** Each question's A0/A1 pair is shown as X/Y with the mapping
   randomized per item and balanced across the set; the judge never sees which is fablever. Run each item in
   BOTH orders (or balance across k) so position bias cancels. (Key files already exist: `hv-judge-key.json`.)
2. **Non-Claude judges, multiple families.** Use a non-Claude judge to remove Claude self-preference bias.
   Use **two independent families (GPT + Gemini)** and **report inter-judge agreement and every disagreement**,
   not just the favorable aggregate. A result that survives two judge families is far harder to dismiss as
   "you picked a judge that likes your style."
3. **Pre-registered, directional predictions** (below). Predicting *where fablever loses* and then showing it
   loses there is credibility, not weakness — it proves the win on action items isn't cherry-picked.
4. **By-category reporting.** 48 prompts, 8 per category (`prompts/preference-battery.json`). Report each
   category separately. Do not average a win in one regime into a headline that implies all regimes.
5. **Capture everything.** Full responses saved per condition/k (`hv-run.mjs` already does this) so any
   proxy is recomputable and any judgment is auditable by a skeptic.
6. **Report nulls and modest margins as-is.** The existing 10/16 (~62%) mixed result is reported next to the
   11/12 (~92%) action result — the honest contrast IS the argument.

## Pre-registered predictions (write these BEFORE running the larger n)
| category (id prefix) | prediction | rationale |
|---|---|---|
| `ACT_` action / how-to | **fablever preferred** (strong) | the "just tell me what to do" ask; answer-first wins |
| `PLN_` planning | fablever preferred (moderate) | decisive plan up front beats an options menu |
| `DEC_` decision | fablever preferred (moderate) | users want a recommendation, not a both-sides survey |
| `DBG_` debug | toss-up | high run-to-run variance observed; report variance honestly |
| `EXP_` explanation / teaching | **plain Opus preferred or parity** | structure/headers genuinely help learning |
| `REV_` code review | **plain Opus preferred** | enumerating issues/structure is the right form here |

A result matching this shape — fablever up on ACT/PLN/DEC, flat-or-down on EXP/REV — is the *expected* and
most defensible outcome. The headline is then necessarily scoped ("on action-oriented work"), which is exactly
the honest claim.

## Scale / power
- Current evidence: 8-question mixed set (16 judgments) → 10/16; 12-question action set → 11/12. One GPT judge.
- Target to firm up: **48-prompt battery × k=2 × 2 conditions = 192 responses**, judged by **2 families
  (GPT + Gemini)** → ~96 pairwise judgments per family. At ~8 per category, a clean within-category direction
  (e.g. ≥13/16 on ACT across both judges) is reportable with a binomial sign test, and cross-category contrast
  is visible.
- Optional confirmatory **human A/B panel** (small, e.g. 5–10 engineers, same blind X/Y pairs): the user noted
  human eval is less objective, so this is *confirmatory only* — it answers "do real humans agree with the
  blind model judge?" If yes, the LLM-judge result stops being the sole basis. Keep it blinded and
  position-balanced; report raw agreement, not a polished number.

## Rebuttal → design-feature that defuses it
| likely rebuttal | what kills it in this design |
|---|---|
| "You judged with Claude, of course it likes itself." | Non-Claude judges only; two families. |
| "You picked a judge that happens to like terse answers." | Two independent families + report disagreement. |
| "Position bias — the second reply always wins." | Per-item randomized + balanced X/Y, both orders. |
| "Cherry-picked questions." | Pre-registered 48-prompt battery, fixed file, by-category, losses shown. |
| "Shorter ≠ better; you rewarded brevity." | Primary metric is asker-preference, not length; correctness proven equal separately; brevity reported as a *secondary* proxy only. |
| "It just drops detail the user needed." | Fabrication-rate metric shows the *opposite* failure (plain invents MORE); decisiveness/answer-position are about ordering, not omission; correctness parity proven on oracled tasks. |
| "n is tiny." | Battery scales to 192 responses / ~96 judgments per family with a sign test. |
| "Words-halve / tools-multiply is false." | That claim is CUT (see audit); not part of this design. |
| "Only helps on toy questions." | Scoped claim — action-oriented advice IS the bulk of day-to-day dev asks; EXP/REV losses are reported, not hidden. |

## How to run (after confirming scope/cost — this launches Opus batches)
```bash
# 1) generate 192 responses (A0 plain vs A1 fablever) over the battery, capture + proxies
HV_PROMPTS=/Users/elon/work/fable-profile/eval/comparison/prompts/preference-battery.json \
OUT=/Users/elon/work/fable-profile/eval/comparison/runs/<date>/preference-battery \
KK=2 node /tmp/hv-run.mjs            # runner: claude-opus-4-8, --output-format json, launch-retry

# 2) build blind position-balanced X/Y packets per item (reuse the hv-judge-key.json pattern)
# 3) judge with GPT (mcp__codex__codex) AND Gemini; ask "which would the busy asker rather receive?"
# 4) score: per-category win-rate per judge, inter-judge agreement, every disagreement listed
# 5) recompute objective proxies + answer-position + fabrication-rate from the captured .txt files
```
The runner, the proxy computation, and the blind-key pattern already exist and are proven. The only new asset
needed to scale is the prompt battery (now committed) and the second judge family.

## Honest limits (state them — they are armor, not weakness)
- The edge is **concentrated on action-oriented advice**; it narrows or reverses on explanation/teaching and
  code review, where structure helps. fablever is a *delivery preference for action work*, not a universal
  upgrade.
- Correctness is **identical**, not better — that is the no-harm result, and it is the whole point: you get the
  preferred delivery at **zero cost to substance**.
- Current statistical base is small (one judge, ≤12 questions); this spec exists precisely to enlarge it.
- "Satisfaction" is ultimately human; the LLM-judge is an objective *proxy* chosen because the user wanted to
  avoid subjective human scoring. The optional human panel is the bridge if a skeptic rejects the proxy.
