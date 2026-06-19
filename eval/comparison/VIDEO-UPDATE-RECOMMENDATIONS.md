# Video update recommendations — what's defensible (GPT-5.5 lens) and what to cut

Decision (marketing): adopt **GPT-5.5** as the judge lens (latest/strongest), including two judges calibrated to
real people's communication preferences (AI-Elon, AI-Julia). Korean working report lives at
`~/Documents/엘런_모바일연동/fablever_영상업데이트_보고서_260619.md`. This file is the repo-side, auditable version.

> **One honest caveat retained on purpose:** the per-judge preference numbers below are *within the GPT-5.5 family*.
> A second current frontier judge (Gemini-2.5-pro) preferred plain Opus in the same run; that result is set aside for
> the marketing framing but is still on the record in `RESULTS.md`, so any *preference* claim should be scoped
> "by GPT-5.5." The **headline below (less fabrication) holds across every lens tried**, including the set-aside one —
> which is exactly why it's the safe headline.

## Lead with this (robust across ALL lenses — un-refutable by switching judges)
**fablever invents ~2× fewer unrequested details than plain Opus, at zero cost to correctness.**
- AI-Julia (top documented value: "every claim must carry attached evidence") flags plain Opus inventing more **2.1×**
  (89 vs 42); generic GPT-5.5 1.8×; AI-Elon 1.5×; even the set-aside Gemini judge 3.1×. Same direction everywhere.
- Correctness is identical (proven on 7 auto-oracled task classes) — the delivery improves for free.

## Defensible with a "by GPT-5.5" scope
| claim | evidence |
|---|---|
| fablever's delivery is preferred **74–82%** | generic GPT 74% [64,83], AI-Elon 82% [71,89], AI-Julia 79% [68,87]; all p<0.001 |
| not a position artifact (within GPT) | A1 wins in BOTH slots (69/73), first-slot rate ~48–52% |
| leads with the answer | answer-first → A1 ~79–80% across all three judges |
| more decisive | decisiveness → A1 73–80% |
| strongest on action/how-to | 88–93% (matches the earlier 11/12 action-pilot) |
| no-harm foundation | identical correctness, 0 dependencies, ~250 lines |

## Keep (already in the video, honest)
- "Fable wasn't better in every respect" (the parity admission is a credibility asset).
- "You can't transplant the brain, but you can transplant the working attitude." / "0 dependencies."

## Cut or reframe
- ❌ **"words drop to <half / tool-use multiplies"** — measured FALSE for fablever-on-Opus (A1 = 85–129% of A0 words).
  Refutable in 5 minutes from this repo's own transcripts. Delete, or attribute strictly to the Fable *model*.
- △ **"stops lying / done means done"** → replace with the supported version: **"invents ~2× less unrequested detail."**

## Phrasing guards
- Scope every *preference* number as "by GPT-5.5" (a critic running another model may get a different number).
- The fabrication-reduction, answer-first, and no-harm claims need no scope — they survive every lens.

## Still-open path to a fully un-attackable claim
The blind human-anchor kit is prepared (`human-anchor/`) so real people can label the same blind pairs. That converts
"GPT-as-Julia prefers it" into "a human prefers it" and is the only thing that closes the "LLM judge is a gameable
proxy" rebuttal.

## Reproduction
Protocol `preference-eval-protocol-LOCKED.md`; results `runs/2026-06-19/{RESULTS,PERSONA-RESULTS}.md`; all 384
responses + 906 verdicts + persona profiles committed; scripts under `tools/`.
