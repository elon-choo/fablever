---
name: fable-delivery-gate
description: Run an acceptance check before handing over an external-facing deliverable — research summaries, docs, marketing/funnel copy, a report, a code-change summary, anything a person will act on. Use right before you present a "final" artifact, or when the user says "send it", "ship it", "is this ready", "finalize", "draft the deliverable". Checks acceptance criteria, not vibes. Pulled on demand; not always-on.
---

# fable-delivery-gate — check the deliverable against its definition of done before handing it over

This skill mirrors fablever's `fable_check` gate. In a controlled sim (`eval/comparison/fable-check-sim/`)
a definition-of-done gate beat the raw first draft **27–0** and closed the *named* acceptance gap (80.6%
vs 12.9%). Honest bound, published in the same file: against a *generic* "make it better" second pass the
gate showed **no edge** (16–9, n.s.). So the value is specifically **checking against stated acceptance
criteria**, not a general polish step.

If the fable-profile MCP is connected (Codex `/mcp`), prefer calling the real `fable_check` tool. This
skill is the procedure to follow with or without it.

## When to use this

- You are about to present a final external-facing artifact: a report, research summary, doc, marketing
  or funnel copy, an email to send, a code-change summary a reviewer will trust.
- The user says "ship/send/finalize it" or asks "is this ready?"

## When NOT to use this

- Mid-draft exploration, or an internal scratch artifact no one will act on yet.
- A trivial one-line answer where a formal gate is ceremony.

## Procedure

1. **State the definition of done.** List the acceptance criteria the artifact must meet — from the
   user's request, the audience, and the medium. If the user never stated them, infer the obvious ones
   and show them.
2. **Check each criterion against the artifact, concretely.** For each: does the artifact actually satisfy
   it? Point to the part that does. Unmet or unverifiable → it fails that criterion.
3. **Catch the common misses:** unstated assumptions presented as fact, claims with no support, missing
   sections the audience needs, scope the user asked for but the draft dropped, broken/placeholder links,
   numbers that were never checked.
4. **Verdict.** PASS only if every criterion is met. Otherwise BLOCK with the specific failed criteria.
5. **On BLOCK, fix and re-run the gate** — do not hand over a BLOCKed artifact. Do not auto-send.

## Expected output

A short PASS/BLOCK verdict with the criteria list. On BLOCK: the exact unmet criteria and what to fix —
then the revised artifact, re-checked.

## Verification

The gate is only meaningful if a criterion could actually fail it. If every criterion is "yes" on first
read with nothing pointed to, you wrote the criteria too loosely — tighten them to the audience's real
needs and re-check.

## Failure cases

- Passing on tone/length while a required section or a load-bearing claim is missing.
- Treating "I reviewed it and it looks good" as a gate — that is not a check against criteria.
- Auto-sending a BLOCKed deliverable because the user said "ship it".
