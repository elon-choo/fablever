# Directive audit — do the flagship Fable directives earn their words *single-shot*?

Every other A/B in this folder tests whether ADDING a technique helps. This one asks the inverse, leaner
question the project's "evidence-based, no dead weight" claim demands: are the directives **already shipped**
in the Fable style each pulling their weight? The method is a clean single-variable **ablation** — run the
full Fable output style against the *same style with exactly one directive paragraph removed* — on tasks
designed to elicit that specific behavior. Contamination control: the reinject hook fires even in headless
`claude -p` and its compact/core reminders repeat these directives, so all arms run with `FABLE_PROFILE=off`,
leaving the output style as the **only** steering source. GPT-5.5 forced choice (both orders, position-bias =
tie) is primary; a deterministic metric is the backstop. Generator Opus 4.8; judge GPT-5.5; n=16 each.

## Results — three flagship directives, none single-shot significant

| directive removed | deterministic signal (A ablated → B full) | judge B vs A | p | read |
|---|---|---|---|---|
| **Don't over-build** | creep score 0.25 → 0.25 (identical) | 10–5 | 0.30 | null |
| **Lead with the outcome** | verdict-in-sentence-1 12.5% → 31.3% (moved as intended) | 6–10 | 0.45 | judge favors *ablated*, n.s. |
| **Report findings, then stop** | unrequested-rewrite 68.8% → 75% (no drop) | 10–4 | 0.18 | null |
| **POOLED** | — | **26–19** of 45 (57.8%) | **0.37** | directional, not significant |

**No directive reaches p<0.05.** Two of three (over-build, report-stop) trend toward the full style; one
(lead-outcome) trends slightly against. The pooled full-vs-ablated split is 26–19 — a 57.8% lean that a
sign test cannot separate from chance at this n (p=0.37).

## What this means — and what it does NOT

1. **The Fable style's per-directive value is not visible single-shot.** On one-shot tasks Opus 4.8 is already
   restrained (it rarely gold-plates: over-build creep was *identical* with and without the line), already
   leads with the answer (0% walkthrough-burying in *either* arm), and the directives can't be shown to move
   the needle on their own. This is the same shape as the routing result (`RESULTS-routing.md`, bounded null)
   and is exactly the **harness paradox** the upgrade research names: a per-turn lift near zero is the
   *expected* reading if the style's real job is longitudinal — holding a long, decaying session on-track —
   which a single-turn A/B structurally cannot observe.

2. **It does NOT prove the directives are dead weight.** "Not significant single-shot" ≠ "useless." Two of
   three trend positive; the lead-outcome deterministic metric *did* move the intended way; and the whole
   thesis is that these traits matter across many turns. So this is **not** a license to delete them. It is a
   precise statement of where the evidence currently stands: their value, if real, lives in the place this
   harness can't reach.

3. **It sharpens why the #7 out-of-band holdout is the load-bearing measurement.** Single-shot ablation has
   now been run against the three most-elicitable flagship directives and returned null three times. That is
   the strongest case yet that the only honest way to decide keep-vs-cut (and to measure fablever's real
   productivity effect) is the longitudinal holdout already built in `measurement/` — turn it on for a
   campaign, harvest outcomes after the fact, compare on/off arms. Until that runs, the directives stay
   (precautionary: 2/3 trend positive, none shown harmful).

## Honest limits

- n=16 per directive; a 57.8% pooled lean would need a much larger n to confirm or refute — these are nulls of
  *insufficient power to detect a small single-shot effect*, not demonstrations of zero effect.
- The deterministic metrics are blunt (e.g. "any code block" counts a one-line illustrative snippet the same
  as a full unrequested rewrite), which is why the judge is primary; where metric and judge diverge
  (report-stop: flat metric, judge leans B 10–4), trust neither alone at this n.
- Pooling across three different ablations answers "does the *whole* style beat a style-minus-one-line on
  these task types," not a per-directive effect; read the per-row results for that.

Reproduce: `node run-overbuild.mjs`, `node run-leadoutcome.mjs`, `node run-reportstop.mjs` (each:
gen → metrics → judge → report; builds a temp `FableNo*` style, runs `FABLE_PROFILE=off`, cleans up).
