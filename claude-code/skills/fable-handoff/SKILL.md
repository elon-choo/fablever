---
name: fable-handoff
description: Open a long or multi-session report with a fixed 3-line [Handoff Summary] (context / what changed / the single decision to act on), and keep a per-session .fablever_state file so an operator juggling many projects can reload context in one glance. Use when finishing a long or multi-step task, reporting back into a project the operator has been away from, or asked to "hand off", "update the state file", or "write the handoff". On-demand; not always-on, and a no-op on short or conversational turns.
---

# fable-handoff — reload an operator's context in one glance

This skill is for the operator who runs several projects asynchronously. When one of them
pings, the real cost is reloading: "what was this, and what do I have to decide?" A long,
outcome-first report still makes them scan for that. This skill puts the answer in a fixed
block at the very top, and keeps a small per-session state file so the next session (or the
operator) can resume without re-reading the whole history.

It is the **trigger-gated** companion to two things the Fable style already does: *Lead with
the outcome* (first sentence = the bottom line) and the *Decision trail* (the bottom-of-report
evidence ledger). The Handoff Summary does not replace either — it sits above the outcome as a
context-reload header, and it never repeats an action item the Decision trail already carries.

## When to use — and when NOT to (this is the whole point)

Emit a `[Handoff Summary]` **only** when at least one of these holds:

1. **The work was long or multi-step** — several tool calls, files created or edited, a real
   work session rather than a single answer.
2. **Multi-session / multi-project signal** — a `.fablever_state/` entry exists for this
   session, or this turn resumes a project after the operator has been away.
3. **A genuine open decision** — there is exactly one thing the operator must decide or check
   before the work can continue.

Do **NOT** emit it on short, single-shot, or conversational turns, or when nothing is left for
the operator to decide — there the block is pure noise, and *Lead with the outcome* already
covers it. If none of the three triggers hold, this skill is a **no-op**: write the normal
lean reply and stop. Over-emitting the block is the failure mode this gating exists to prevent.

## The Handoff Summary block

Fixed label, at most three content lines, always at the very top of the report, tighter than
the body beneath it. Labels may be bilingual on a Korean-briefing machine; the body follows the
session's briefing language.

```
[Handoff Summary]
· 맥락(Context):        what this work was for — one line
· 한 일(Done):          the key files/logic that changed — one or two lines, with paths
· 결정 필요(Action):    the single decision or check the operator must act on now —
                        a file:line or the exact point, or "없음 — 완료 / none — done"
```

Rules: exactly **one** Action item (if there are several, name the blocking one and fold the
rest into the body). Pin it to a `file:line` or an exact point whenever one exists. If a
Decision trail also appears at the bottom, state the action **here only** — never in both.

## The `.fablever_state` file

For work that spans sessions, keep a small state file so the next session reloads instantly.

- **Path.** `.fablever_state/<session-id>.md`, one file per session — because the operator runs
  many projects at once and a single root file would collide. A single root `.fablever_state.md`
  is the fallback only for a lone, single-project repo.
- **Schema** (machine-maintained — don't hand-edit casually):

  ```markdown
  # .fablever_state — <session-id>  (auto-maintained)
  - Session ID:        PRJ-01-checkout
  - Ultimate Goal:     the operator's stated end goal — one line
  - Current Milestone: the logic being worked right now
  - Pending Blockers:  unresolved items, or "none"
  - Last Updated:      2026-06-24T11:00:09Z   (UTC ISO-8601)
  - Touched Files:     src/a.ts, db/0042.sql  (changed this milestone)
  ```

- **When to write/update.** At the start of a multi-session task and at each milestone switch.
  Do **not** create it for work under the multi-session threshold — that is over-building.
- **Privacy.** `.fablever_state*` is gitignored by default so an operator's local working
  context never gets committed. Opt in explicitly if a team wants to share it.

## Self-correct before you escalate (the 3-retry boundary)

When a step fails in a way you can recover from — a wrong path, a missing flag, a transient
error — try a genuinely *different* fix up to about three times before handing the question
back via the Action line; each attempt must rest on new information, not a rerun of the same
thing. Escalate sooner only when you are actually blocked. A **destructive, irreversible, or
scope-changing** failure is never something to retry around — surface it at once. Safety and
the project's approval rules outrank this boundary, always.

## Report

Name the state file you wrote or updated, confirm the single Action item is pinned to a
`file:line`, and — if you decided this turn did **not** meet the trigger — say so in one line
("short turn — no handoff block") rather than emitting an empty block.

## Honest bound

A pre-registered two-lab A/B (`eval/technique-ab/run-handoff.mjs` + `rejudge-handoff-gemini.mjs`,
n=15 completion-report scenarios, GPT-5.5 + Gemini 3.1) measured what this block does and does not do:

- **What it earns.** Forced-choice judges *strongly* prefer the `[Handoff Summary]` packaging — GPT-5.5
  11–2 (p=0.022) and Gemini 15–0 (p<0.001). On short throwaway tasks the directive emitted the block
  **0% of the time**, so the "skip on short turns" gating works and it does not spam trivial turns. The
  retry boundary cut "proceed-without-sign-off on a destructive action" to 0% (vs 33% without it).
- **What it does NOT prove.** That judge preference is for a block the judge can *see* — it is
  unblindable. An arm-neutral deterministic check found the base Fable style (lead-outcome +
  decision-trail) already surfaces the single decision **just as early** as the block does
  (chars-to-decision ~87 vs ~99). So this is a **presentation/preference aid, not a measured
  reload-speed gain**. That is exactly why it lives here as an opt-in skill and is **deliberately kept
  out of the always-on style** — a genuine speed claim needs the longitudinal `measurement/` holdout
  (real multi-session usage), which a single-shot A/B cannot see.
