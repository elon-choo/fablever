# Error-prone tasks — baseline calibration (plain Opus, k=3)

Built 6 tasks whose spec is clear but whose first-draft implementation is easy to botch (interval
intersection w/ single-point touch, sliding-window-max last-window, repeated-key query→array, multiset diff,
depth-bounded flatten, banker's rounding). Goal: find headroom where PLAIN Opus fails, so a
verification-before-completion PROCESS can be shown to beat it.

**Result: plain Opus = 18/18 (100%), every task 3/3, meanTurns 5.4, 0 launch fails.**

No headroom. Opus aces even the deliberately tricky cases. This is the **fourth** single-file task class to
saturate plain Opus (after coding-easy, coding-hard, work-quality). Implication: **a process intervention
cannot demonstrate a quality win on single-file tasks — there is no failure to fix.** Consistent with
superpowers' own framing that process pays off on *long, multi-step* work where the model drifts, not on
short tasks. → Next: compound tasks (multiple interacting changes + regression suite), the one regime with
plausible headroom (`tasks/compound/`).
