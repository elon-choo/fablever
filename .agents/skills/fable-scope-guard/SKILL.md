---
name: fable-scope-guard
description: Hold the exact scope the user asked for — no extra files, no refactors, no "while I'm here" cleanup, no speculative features. Use when the user says "only", "just", "do not edit", "minimal change", "report only", "no refactor", "don't touch X", or otherwise draws a narrow boundary; and as a check before you touch any file the request did not name. Pulled on demand; not always-on.
---

# fable-scope-guard — change only what was asked, nothing adjacent

This skill encodes fablever's single most robust measured behavior: **scope discipline**. In the
style-only ablation (`eval/style-only-ablation/RESULTS.md`, deterministic, no judge) the Fable working
style held **0% scope violations vs plain Claude's 42%**. That is the win to protect here — it is a
discipline, not a capability, so it only holds if you apply it deliberately.

The instinct to "improve while I'm here" is the failure mode. A bug fix does not need surrounding
cleanup; a one-shot edit does not need a new helper or abstraction.

## When to use this

- The user set a narrow boundary: "only", "just", "minimal", "report only", "do not edit / refactor /
  touch", "don't add dependencies".
- You are about to edit, create, or delete a file the request did not explicitly name.
- A linter/build error tempts you to change working code that is not part of the task.

## When NOT to use this

- The user explicitly asked for a refactor, cleanup, or broad change — then breadth IS the scope.
- A genuine system boundary (real user input, an external API) needs validation the task implies.

## Procedure

1. **Write the boundary down.** In one line, state what is in scope and what is explicitly out. If the
   user used "only/just/report-only", treat everything not named as out.
2. **Touch only named surfaces.** Edit only files the task names or that are unavoidably required to make
   the named change compile/run. Do not create README/docs/helpers unless asked.
3. **No adjacent work.** No renames, reformatting, dependency additions, or "drive-by" fixes to unrelated
   code. If you spot a real separate problem, note it in your report — do not fix it now.
4. **If a fix requires touching working code outside scope, stop and ask.** State the file, the change,
   and why; wait for confirmation rather than expanding scope yourself.
5. **Prefer editing over creating.** If the change fits an existing file, do not introduce a new one.

## Expected output

The minimal diff that satisfies the request, plus a one-line "out of scope, noted but not changed:" list
for anything you deliberately left alone.

## Verification

Before finishing: re-read the request's boundary line. Does every changed file appear in it (or is it
strictly required by it)? If any changed file is not justified by the boundary, revert that change.

## Failure cases

- "While I was there I also tidied up X" → a scope violation, even if X is better now.
- Adding a dependency, config, or abstraction the task did not ask for.
- Refactoring working code to fix a linter warning without flagging it first.
