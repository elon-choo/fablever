# Decision-trail — Round 3: briefing-judgeability (calibrated judge, FableTrail FT)

FT briefings carrying a Decision trail: **100%**. A blind judge reads ONLY the briefing and predicts PASS/FAIL; ground truth = correct vs subtly-wrong reference. **Discrimination = accept-good% − accept-bad%** (higher = the briefing carries real signal). The key error rate is **accept-bad%** — approving defective work.

| arm / judge | n good | n bad | accept-good % | accept-bad % | discrimination |
|---|---|---|---|---|---|
| FB/gpt | 6 | 6 | 50 | 0 | 50 |
| FB/gemini | 6 | 6 | 0 | 0 | 0 |
| FB/pooled | 12 | 12 | 25 | 0 | 25 |
| FT/gpt | 6 | 6 | 16.7 | 0 | 16.7 |
| FT/gemini | 6 | 6 | 0 | 0 | 0 |
| FT/pooled | 12 | 12 | 8.3 | 0 | 8.3 |

Predicted: FT discrimination > FB, driven by a LOWER FT accept-bad% (the grounded trail + "where to look" line makes the reviewer catch defective work). Small-N pilot; directional.