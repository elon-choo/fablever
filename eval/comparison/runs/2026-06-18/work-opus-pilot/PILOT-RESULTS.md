# Work-quality pilot — Opus, A0 (plain) vs A1 (fablever) — k=1, n=6

Real data, reported including the null/negative. Tasks: `tasks/work-quality/` (6 maintenance jobs with a
pre-existing test suite; clean = does the ask without breaking existing behavior). Metrics extracted from
each run's `--output-format json` (`num_turns`, `output_tokens`).

| condition | clean | regression | incomplete | mean turns | mean output tokens | launch fails |
|---|---|---|---|---|---|---|
| A0 plain Opus | 6/6 | 0 | 0 | 4.7 | 1033 | 0 |
| A1 fablever (Fable on) | 6/6 | 0 | 0 | 5.7 | 1608 | 0 |

## Reading (honest)
- **No quality gap.** Both arms 6/6 clean — zero regressions, zero incompletes. Plain Opus does not
  over-build on well-specified tasks, so the restraint headline **saturates** (same wall the coding
  pass-rate hit).
- **Efficiency went the WRONG way for fablever:** +1 turn (5.7 vs 4.7) and **+55% output tokens** (1608 vs
  1033) for the identical clean outcome. fablever's verification/output discipline is wasted motion when the
  outcome already ceilings.
- **n=6, k=1 → directional only**, but it clearly does not support "fablever helps real work" here. If
  anything it shows a token/turn cost at parity quality.

## Why, and what it implies
On closed, well-specified tasks a current strong model (Opus) is already correct and restrained, so a
working-*style* layer has no objective outcome to move. An objective fablever advantage can only appear where
plain Opus actually fails — harder / messier / under-specified tasks where the praised Fable strengths
(decisiveness, self-verification, restraint under temptation) change the outcome rather than just the prose.
That is the next (and likely last clean) regime to test. This pilot is consistent with the project's own
honesty contract: fablever transplants STYLE, not CAPABILITY — and style does not move a saturated objective
metric.

Per-run detail in `extracted.json`.
