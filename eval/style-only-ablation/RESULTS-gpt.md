# Style-only ablation — GPT-5.5 cross-judge of F-vs-B (does the Gemini result hold?)

Same cached B/F replies and the SAME criteria-based forced-choice prompt as `run-ablation.mjs`; only the JUDGE changes (Gemini-2.5-pro → GPT-5.5 via the Codex CLI). Both orders; order-inconsistent = tie. This tests whether the flagship "fablever does not beat plain on quality" result is a judge artifact (motivated by the real-log replay, which DID flip between these two judges).

| judge | F (fablever) | B (plain) | ties | decided | F win-% | p | 95% CI |
|---|---|---|---|---|---|---|---|
| Gemini-2.5-pro (original) | 4 | 9 | 35 | 13 | 30.8% | 0.2668 | [12.7, 57.6]% |
| **GPT-5.5** (via codex) | 17 | 26 | 5 | 43 | 39.5% | 0.2221 | [26.4, 54.4]% |

## Reading: this one did NOT flip — the quality result is judge-robust
Both judges put **plain slightly ahead** of fablever on raw quality, neither significantly (Gemini 30.8% / GPT-5.5 39.5% fablever-win-rate among decided). GPT-5.5 is far more decisive (43 decided vs Gemini's 13; it calls fewer ties) yet lands the **same direction**. So unlike the real-log replay (real messy prompts, where the judges disagreed and GPT preferred fablever), the **synthetic ablation quality comparison is judge-independent**: fablever genuinely ties-to-slightly-behind plain on clean well-specified tasks, confirmed by two different-lab judges. The convenient "it was just judge bias" explanation was tested here and did **not** hold — which is exactly why it is worth reporting.

Hypothesis for why real-log flipped but this did not (not tested): clean synthetic tasks reward plain's thoroughness for both judges, while real, vague/decision-type prompts reward fablever's decisiveness — and the two judges weight that differently.