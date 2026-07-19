# RESULTS — G1.1 premise-reproduction control (proxy) · 2026-07-17

Protocol: `eval/premise-control.md`. The entire orchestration line rests on one uncontrolled anecdote —
"Fable spawned many more subagents than Opus in ultracode, diverged more ideas, designed agents more
thoroughly." This is the cheap falsifier the ledger put at position zero: does the gap reproduce when only
the worker model changes?

## What was run (and its honest limitation)

One representative design task (a directory-watching CLI with `--dry-run`; "produce a design plan, not the
implementation") run twice under matched conditions, varying **only** the worker model:
`claude -p --model fable` vs `claude -p --model opus`, same env / CLAUDE.md / skills / hooks / cwd.

**Limitation, stated up front:** this is a `-p` (headless, one-shot) **proxy**, not the interactive
`ultracode` agentic run the anecdote came from. So it CANNOT measure the protocol's headline metric — "did it
author a workflow at all?" — because headless `-p` does not expose workflow authoring. It measures the
text-level surrogate: decomposition depth, edge-case coverage, and whether either model *proposes* a
multi-agent / parallel structure in its design. That is a weaker test than the protocol's ideal, and the
number below should be read as such: a first, cheap, recorded baseline — not the full control.

## Result — near-parity under matched conditions

| metric | Fable arm | Opus arm |
|---|---:|---:|
| wall-clock | 182 s | 100 s |
| output bytes | 5,052 | 4,987 |
| structural elements (headings + list items) | 28 | 29 |
| edge-cases / failure-modes named | 5 | 5 |
| proposes a multi-agent / parallel structure | 0 | 0 |

Both produced strong, near-indistinguishable design plans. Fable opened with a recommendation + a
`fable_check` note (its working-style signature); Opus opened with the single core design decision. Neither
reached for multi-agent decomposition on this task. The dramatic gap the anecdote described did **not**
reproduce at this text-design level with the model swapped under identical context.

## Reading (per the protocol)

This lands in the protocol's **"gap shrinks / vanishes under matched conditions"** branch — with the caveat
that the proxy can't see the workflow-authoring act, which is where the anecdote's gap was largest. Taken at
face value for what it CAN see, it suggests a meaningful fraction of the original observation was a
harness-setting confound (Fable-in-ultracode-with-workflow-authoring vs Opus-not), exactly the phantom this
control exists to catch. It is also consistent with the charter's own thesis: under matched context the two
are "closer to Fable, never equal" — not a chasm.

**Re-prioritization note (recorded per DoD):** the orchestration/recipe investment should NOT be sized
against the raw anecdote. If a real gap exists, the proxy says it is smaller than the anecdote implied and
likely concentrated in the *decision to author a workflow* (a wording/trigger problem — cheap to address)
rather than in divergence or design depth (expensive recipes). Before any further orchestration investment,
the interactive-run version of this control (measuring the workflow-authoring act itself) should run — that
is the honest full test, and this proxy is its cheaper predecessor.

## Scope

n=1 task, text-level proxy. Fires no magnitude claim. It is a recorded, reproducible baseline where the
original anecdote was neither — which was the point.
