# Decision-trail feature — simulation pre-registration

Written and committed **before** the run produces numbers (the repo's honesty contract: predictions and a
kill-criterion are fixed in advance; results — including nulls — are committed unedited).

## What is being tested

The fablever feature added in this change: a capped, outcome-LAST **"Decision trail"** (an evidence ledger
of the agent's decisions, each anchored to a file/command/test) plus a sparse work-time attention re-anchor,
made verifiable by three new deterministic rules inside the shipped `fable_lint`. The feature is pitched as
**auditability/monitorability, not accuracy** — grounded in the prior art (ReflAct; the CoT-faithfulness
papers; ADR/Y-statement; Fok & Weld verifiability + the trust-calibration HCI literature; the
process-supervision nulls of Sprague 2025 / Jia-Rakhlin-Xie 2025).

## Arms (single delta)

- **FB** — current fablever exactly as shipped (live output style + reinject/subagent hooks). Plain `claude -p`.
- **FT** — FB **+** the `profiles/decision-trail.md` addendum injected via `--append-system-prompt`.

Worker model held fixed at `claude-opus-4-8`. The live install is never mutated; FT differs from FB only by
the appended addendum. (Both arms are full fablever — this measures the *trail*, not fablever-vs-plain.)

## Battery

- **Should-emit / "work"**: the 6 committed coding fixtures (`tasks/coding/{C1,C2,C3,C6,C7,C9}`), each in a
  correct (`refs/solution.js`) and a subtly-wrong (`refs/wrong.js`) variant — both mutation-verified. The
  model writes a briefing reporting on the given implementation as work it "just did" (the faithful trigger
  for a trail). 6 tasks × {good,bad} × {FB,FT} = 24 briefings.
- **Should-NOT-emit / "trivial" (negative control)**: 6 trivial one-liner how-to prompts (`ACT_*`). No agent
  work-decisions → a trail here would be bloat. 6 × {FB,FT} = 12.

## Measurements

- **EXP-1 (scope + form, deterministic — graded by the real shipped `fable_lint`)**: trail-present %,
  grounded % (of trails), bloat % (of trails), trail-lint-pass %, and median words on the OUTCOME answer
  (text above the trail) FB vs FT.
- **EXP-2 (briefing-judgeability — the feature's actual goal)**: a blind judge (GPT-5.5 via `codex exec` +
  Gemini-2.5-pro) reads ONLY the briefing and predicts PASS/FAIL of the hidden test suite. Ground truth =
  the committed oracle (solution→PASS, wrong→FAIL). Metric per arm = **discrimination = accept-good % −
  accept-bad %**. The key error rate is **accept-bad %** (a reviewer fooled into approving defective work).

Unit of analysis = the task (cluster). Explicitly an underpowered pilot; directional only.

## Pre-registered predictions (incl. predicted nulls / where it must NOT help)

1. **Scope gate**: FT/work trail-present % is high; **FT/trivial trail-present % is ~0**. A trail on trivial
   prompts is an anti-gaming failure.
2. **Grounding**: FT trails are grounded (grounded % high; ungrounded-trail-line rare) — because the new
   `fable_lint` rule flags unanchored lines. A low grounded % means the discipline degenerated into
   narration → kill or promote to a hard gate.
3. **No bloat / verbosity guard**: FT bloat % ~0, and **FT median answer-words ≈ FB** on /work (the trail
   adds words BELOW the answer, not inside it). If FT's lead answer balloons, the anti-CoT-dump boundary
   failed.
4. **Briefing-judgeability (the one predicted WIN)**: **FT discrimination > FB**, driven mainly by a **lower
   accept-bad %** under FT (the grounded "where to look" line points the reviewer at the real defect). This
   is the feature's whole justification; if FT ≤ FB here it is a competence-signal placebo (Bansal 2021).
5. **No outcome miracle**: this sim does not claim a task-success lift; per the process-supervision nulls a
   large accuracy gain would be a red flag, not a win.

## Kill criterion (allowed to falsify — do not tune to pass)

Kill or trim the feature if any of: FT emits trails on trivial prompts; FT grounded % is low; FT median
answer-words balloons vs FB with no judgeability gain; **or FT briefing-discrimination ≤ FB** (the trail
adds no judgeability). A null on outcome is expected and acceptable; the feature survives on
briefing-judgeability or not at all.
