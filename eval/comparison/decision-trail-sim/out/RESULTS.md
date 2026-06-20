# Decision-trail feature — simulation results

Arms: **FB** = current fablever (plain `claude -p`). **FT** = FB + the decision-trail addendum via `--append-system-prompt`. Single delta. Worker `claude-opus-4-8`. Live install never mutated.

## EXP-1 — scope gating + form guard (deterministic; graded by the shipped `fable_lint`)

| arm / stratum | n | trail present % | grounded % (of trails) | bloat % (of trails) | trail lint-pass % | median answer words | median total words |
|---|---|---|---|---|---|---|---|
| FB/work | 12 | 0 | null | null | null | 261.5 | 261.5 |
| FB/trivial | 6 | 0 | null | null | null | 156 | 156 |
| FT/work | 12 | 0 | null | null | null | 258 | 258 |
| FT/trivial | 6 | 0 | null | null | null | 125.5 | 125.5 |

Reading: FT/work `trail present %` should be high and FT/trivial should be ~0 (scope gate). `grounded %` high = trails cite artifacts. `bloat %` ~0 = no CoT-dump. FT vs FB **median answer words** on /work should be ~equal — that is the verbosity guard (the trail adds words BELOW the answer, not inside it).

## EXP-2 — briefing-judgeability (blind judge reads ONLY the briefing; ground truth = the committed oracle)

Discrimination = (accept-good %) − (accept-bad %). Higher = the briefing carries more real signal about whether the work is correct. Predicted: FT > FB.

| arm / judge | n good | n bad | accept good % | accept bad % | discrimination (pts) |
|---|---|---|---|---|---|
| FB/gpt | 6 | 6 | 50 | 0 | 50 |
| FB/gemini | 5 | 6 | 0 | 0 | 0 |
| FB/pooled | 11 | 12 | 27.3 | 0 | 27.3 |
| FT/gpt | 6 | 6 | 0 | 0 | 0 |
| FT/gemini | 6 | 6 | 0 | 16.7 | -16.7 |
| FT/pooled | 12 | 12 | 0 | 8.3 | -8.3 |

_Small-N pilot; directional only. accept-bad % is the key error rate — a lower accept-bad under FT means the trail helped the reviewer catch defective work._
