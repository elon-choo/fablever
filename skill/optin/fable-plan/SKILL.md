---
name: fable-plan
description: For genuinely hard multi-part work, write a durable decision-complete plans/{slug}.md before execution, then build against it. Use when a task has roughly four or more distinct parts, spans several files, or has real ordering/dependency. Pulled only by an explicit trigger; never a default/always-on stage.
---

# fable-plan — durable decision plan before execution (hard multi-step only)

This skill turns a measured result into an action. In a controlled A/B
(`eval/technique-ab/run-plan-first.mjs`, GPT-5.5-judged, n=12 on deliberately hard 5-part tasks),
externalizing a numbered plan before executing beat diving straight to the deliverable **9–1 of 10 decided
(90%, p=0.0215)**. On hard multi-step work, the plan-first deliverable was better organized and more correct.
The cost is one short planning pass — so this is **only** worth it when the task is genuinely hard.

Enter this flow only when `fable-plan` is explicitly pulled for genuinely hard multi-part work. Never
enter it from a default or always-on path.

The artifact is `plans/<lowercase-kebab-slug>.md`. It is a durable **decision/criteria snapshot**, not a
second execution-state store. It may record the outcome, scope, acceptance criteria, dependency order,
risky assumptions, and non-goals. It must never record progress, status, completed steps, retries,
verification debt, or task checkboxes — those mutable facts belong only in the run ledger.

## When NOT to use this (this bound is the whole point)

- A single-file change, a one-step fix, a question, or anything you can do correctly in one pass → just do
  it. A plan here is pure overhead — the A/B win was on *hard 5-part* tasks, and an A/B on routing found
  always-planning adds length without quality on simple work.
- You haven't read the relevant code yet → read enough to plan against reality, not a guess.

## Optional clarify gate (never a default stage)

After reading the available context, enter this gate only if both conditions hold: the task remains
genuinely ambiguous, and a wrong assumption would be costly or hard to reverse. Ask at most one
clarifying question, aimed only at this task's acceptance criteria. If either condition is false — or the
available context is already enough — ask no question and act when you have enough. A second question is
not authorized; never turn this into an interview or follow-up round.

If that one answer adds task-specific acceptance criteria, capture them before plan/contract creation:

- add each criterion's `id` and `description` to `contract.criteria`;
- put the same descriptions under the plan's `## Criteria`; and
- place this exact block in that section and pass it as optional `task_criteria` to `fable_check`:

```md
<!-- fable-task-criteria:v1 -->
- [task.mobile-layout] Include a mobile layout.
- [task.desktop-layout] Include a desktop layout.
<!-- /fable-task-criteria -->
```

Use one line per criterion. Keep the IDs stable and record only criteria established for this task; do
not invent extra requirements.

## Procedure

1. **Confirm the explicit trigger and complexity floor.** Roughly four or more distinct parts, multiple
   files, or real ordering/dependency. Otherwise skip the entire plan flow.
2. **Read enough reality to decide.** Inspect the relevant code, constraints, and existing run contract
   before writing; do not plan from guesses.
3. **During the plan-writing phase, write only `plans/<slug>.md`.** Do not touch product code. Use the
   exact template below and replace every comment with decision content.
4. **Lint before execution.** Every required section and both Scope subsections must be non-empty; Ordered
   dependencies must be numbered. The repository/runtime linter is
   `node orchestration/lib/plan-artifact.mjs lint plans/<slug>.md` when that path is available.
5. **Hash-bind the plan to the run contract.** Record its exact SHA-256 as `contract.planHash` with the
   absolute `contract.planPath`; `contract.created` preserves the initial binding in the append-only ledger.
6. **Execute against the decisions.** Record progress, check results, blockers, and debt only as typed
   run-ledger events. Never update the plan merely because work advanced.
7. **Handle material steering explicitly.** A decision change may revise the relevant plan section, but
   it must be re-linted and followed by either a typed `plan.rebound` event to the new hash or a
   hash-specific `plan.deviation.recorded` event with a reason. Silent hash divergence is invalid.

## Required template

```md
# Plan: <short decision title>

<!-- Decision/criteria snapshot only. Progress and debt belong in the run ledger. -->

## Outcome

<!-- State the observable outcome this work must produce. -->

## Scope

### In

<!-- List what is in scope. -->

### Out

<!-- List what is explicitly out of scope. -->

## Criteria

<!-- List acceptance criteria. Do not use progress checkboxes. -->

## Ordered dependencies

<!-- Number dependencies/steps in the order decisions require them. -->

## Risky assumptions

<!-- List assumptions whose failure would change the decision. -->

## Non-goals

<!-- List outcomes this plan deliberately does not pursue. -->
```

## Expected output

A lint-clean `plans/<slug>.md`, its contract-bound SHA-256, then the deliverable built against those
decisions. Mutable progress and debt remain solely in the run ledger.

## Honest bound

The A/B measured a forced-choice quality preference on hard 5-part tasks; it does **not** show plan-first
helps on simple work (it doesn't — that's why this skill is trigger-gated), and it is a one-shot quality
result, not a multi-session or productivity number. Use it where the task is actually hard.
