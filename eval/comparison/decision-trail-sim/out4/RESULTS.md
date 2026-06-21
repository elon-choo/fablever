# Decision-trail — Round 4 (large follow-up): briefing-judgeability on the agent's OWN work

15 harder tasks (coding-hard + error-prone). The agent does each task itself (edits the stub, cannot run tests → briefs on belief); the committed oracle is ground truth. FB = plain fablever, FT = FableTrail. A calibrated blind judge predicts PASS/FAIL from the briefing alone. **Discrimination = accept-good% − accept-bad%**; key error rate = **accept-bad%** (approving the agent's own broken work).

| arm / judge | n good | n bad | accept-good % | accept-bad % | discrimination |
|---|---|---|---|---|---|
| FB / gpt | 12 | 2 | 100 | 0 | 100 |
| FB / gemini | 13 | 2 | 61.5 | 0 | 61.5 |
| FB / pooled | 25 | 4 | 80 | 0 | 80 |
| FT / gpt | 11 | 3 | 90.9 | 0 | 90.9 |
| FT / gemini | 11 | 3 | 54.5 | 0 | 54.5 |
| FT / pooled | 22 | 6 | 72.7 | 0 | 72.7 |

**Manipulation checks:**
- FB (oracle): oracle PASS 86.7%, trail present 0% (n=15)
- FT (oracle): oracle PASS 80%, trail present 80% (n=15)

This is the realistic test Round 3 could not be: the agent believes its own work correct, so accept-bad% has real headroom. Small-N pilot, cluster=task; directional.