# Decision-trail — Round 2 (DO-IT: agent fixes a stub; its own fix scored by the committed oracle)

Trigger fixed after Round 1 (fire on any code change / multi-step fix, not only multi-file). FB = plain fablever, FT = + decision-trail addendum. Worker `claude-opus-4-8`. Live install untouched.

| arm / stratum | n | trail present % | grounded % | bloat % | trail lint-pass % | median answer words | median total words | oracle PASS % |
|---|---|---|---|---|---|---|---|---|
| FB/work | 6 | 0 | null | null | null | 202 | 202 | 100 |
| FB/trivial | 6 | 0 | null | null | null | 156 | 156 | null |
| FT/work | 6 | 66.7 | 100 | 0 | 50 | 195 | 294 | 100 |
| FT/trivial | 6 | 0 | null | null | null | 125.5 | 125.5 | null |

Reading: FT/work trail-present % should now be high (the trigger fix); FT/trivial ~0 (scope gate holds). grounded % high + bloat % ~0 = the trail is an evidence ledger, not a CoT dump. FB vs FT **median answer words** on /work ~equal = the verbosity guard (trail adds words below the answer). **oracle PASS %** FB vs FT ~equal = the trail did not lower task success.
