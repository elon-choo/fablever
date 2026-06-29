---
name: fable-plan
description: For a genuinely hard, multi-part task, externalize a short numbered plan BEFORE executing, then build against it — so the deliverable is better organized and more correct than diving straight in. Use when a task has roughly four or more distinct parts, spans several files, or has ordering/dependency between steps. Pulled on demand; not always-on, and a no-op on simple or single-step work.
---

# fable-plan — write the plan before you build it (hard multi-step only)

This skill turns a measured result into an action. In a controlled A/B
(`eval/technique-ab/run-plan-first.mjs`, GPT-5.5-judged, n=12 on deliberately hard 5-part tasks),
externalizing a numbered plan before executing beat diving straight to the deliverable **9–1 of 10 decided
(90%, p=0.0215)**. On hard multi-step work, the plan-first deliverable was better organized and more correct.
The cost is one short planning pass — so this is **only** worth it when the task is genuinely hard.

Your job: surface the plan as a short artifact the work then follows — **don't pad a simple task with
ceremony.**

## When NOT to use this (this bound is the whole point)

- A single-file change, a one-step fix, a question, or anything you can do correctly in one pass → just do
  it. A plan here is pure overhead — the A/B win was on *hard 5-part* tasks, and an A/B on routing found
  always-planning adds length without quality on simple work.
- You haven't read the relevant code yet → read enough to plan against reality, not a guess.

## Procedure

1. **Confirm it's hard enough.** Roughly four or more distinct parts, multiple files, or real ordering /
   dependency between steps. If not, skip this skill.
2. **Write a short numbered plan first** — the parts in order, each one a concrete step with its target
   outcome and (where it matters) what it depends on. Keep it tight: one line per step, not an essay.
3. **Name the risky or uncertain steps** — the one or two places most likely to be wrong, and the check
   that will tell you. This is where plan-first pays off: you catch ordering/coverage gaps before building.
4. **Execute against the plan**, in order. If reality diverges, update the plan line rather than silently
   drifting — the plan stays the spec you're building to.
5. **Close each part with its check.** A step isn't done until the thing that proves it (a test, a diff
   against the spec, a run) passes — ground completion in evidence, not in "looks right."

## Expected output

A short numbered plan up front, then the deliverable built against it, with each part's check shown. The
plan is a means, not the deliverable — keep it proportional to the task.

## Honest bound

The A/B measured a forced-choice quality preference on hard 5-part tasks; it does **not** show plan-first
helps on simple work (it doesn't — that's why this skill is trigger-gated), and it is a one-shot quality
result, not a multi-session or productivity number. Use it where the task is actually hard.
