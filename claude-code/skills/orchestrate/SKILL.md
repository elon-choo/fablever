---
name: orchestrate
description: Route a task to a proven multi-agent Workflow recipe (independent adversarial review, divergent exploration, decompose-and-fan-out, staged map, or best-of-N judge panel) instead of answering inline. Use when a task is genuinely multi-part, needs independent verification, needs many distinct ideas, or processes many items — and the user has opted into multi-agent orchestration. Pulled on demand; not always-on.
---

# orchestrate — pick a recipe, fill its args, launch it

This skill turns Fable's orchestration edge into something a non-Fable worker can
reuse: a small menu of **executable Workflow recipes**. Your job is the part that
transplants — **recognize the task shape and select the recipe** — not to author an
agent graph from scratch. The recipes live in `orchestration/recipes/*.mjs` and are
self-contained Workflow scripts; launch one with the Workflow tool by `scriptPath`.

Read `orchestration/README.md` and `docs/ORCHESTRATION-RESEARCH.md` for the why.

## When NOT to use this

- A trivial or single-step task → answer inline. Fan-out on a one-liner is
  over-building, and every recipe has a complexity floor that will no-op anyway.
- The user has not opted into multi-agent orchestration → don't spend the agents.
- You only need a fact you can look up directly → just look it up.

## Decision table

| If the task is… | use recipe | launch with args |
|---|---|---|
| "is this artifact / plan / diff / answer sound?" | `adversarial-verify.mjs` | `{ artifact }` |
| "what are the possible approaches / designs / causes?" | `divergent-explore.mjs` | `{ question, lenses? }` |
| "do this big multi-part task" | `decompose-first.mjs` | `{ task }` |
| "process each of these N items through stages" | `pipeline-map.mjs` | `{ items, extract, transform, verify }` |
| "produce this ONE high-stakes artifact really well" | `judge-panel.mjs` | `{ task, angles?, rubric? }` |

If two apply, compose: e.g. `decompose-first` for the build, then
`adversarial-verify` on its output before delivering.

## How to select lenses (recognition, not invention)

For `adversarial-verify` and `divergent-explore`, pick lenses from the fixed menu in
`orchestration/lenses.md` — choose the ~5 whose descriptions actually fit this task,
drop overlapping ones. Do not invent a full lens set from scratch; classifying
against the menu is the part a weaker worker does reliably.

## Binding guardrails (do not break these)

- **Never set a count quota.** Let `decompose-first` key width to the sub-problems it
  actually finds; let `divergent-explore` stop on its dry-streak. Quotas reward-hack.
- **Verifiers must be fresh-context.** The recipes already spawn skeptics in their own
  contexts — never paste the original answer into a "review this" prompt in the same
  thread; that rubber-stamps.
- **Agent count is cost, not success.** Report what a recipe *found*, not how many
  agents it ran.
- **Don't claim a magnitude.** These recipes are validated for *direction* by
  mechanism, not yet for *size* of gain. Say "ran independent adversarial review,"
  not "caught 30% more bugs," until `eval/` says otherwise.
- **The RED gate proves verification ran, not that it was deep.** Treat a passing gate
  as "someone independent looked," not "this is certainly correct."

## After a recipe runs

Relay what it found (confirmed defects, distinct approaches, the integrated answer) —
the recipe's return value is data for you, not a user-facing message. Lead with the
outcome; keep the agent-count and cost out of the headline.
