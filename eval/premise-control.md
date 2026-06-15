# Premise-reproduction control (position zero)

The completeness critic's first required fix. The entire orchestration effort rests
on **one uncontrolled observation**: "Fable spawned many more subagents than Opus in
ultracode, diverged more ideas, designed agents more thoroughly." That is a real
signal worth chasing — but before building a recipe library to close the gap, confirm
the gap **reproduces under matched harness conditions.** If part of it was Fable-in-
ultracode vs Opus-not, or different `CLAUDE.md` / skills / hooks context, then the
"recoverable fraction" is being measured against a phantom.

This is hours, not weeks — a strictly cheaper falsifier than the full A/B.

## Why this can't be auto-run from here

The original task that produced the anecdote is not recorded (no prompt, no effort
setting, no context snapshot). So this control is a **protocol you run**, not a
button. Capture the inputs this time so it never has to be reconstructed again.

## Protocol

Pick **3 representative tasks** of the kind where you saw the gap (e.g. a design
exploration, a code audit, a multi-part build). For each task, run it **twice under
matched conditions**, changing only the worker model:

| hold fixed | vary |
|---|---|
| exact prompt (verbatim) | worker model: Fable vs Opus |
| effort level = `ultracode` for BOTH | — |
| same `CLAUDE.md`, skills, hooks, MCP set | — |
| same repo state / cwd | — |

For each run, record from `/workflows` and the transcript:

- **did it author a workflow at all?** (the decision act — the biggest expected gap)
- **agent count** and **fan-out width** (cost denominators, not quality)
- **distinct ideas / hypotheses surfaced** (for the divergence claim)
- **was there an independent verify/review pass?** (yes/no)
- the **agent-graph shape** each produced (sketch it)

## Reading the result

- **Gap reproduces** (Opus-in-ultracode still authors fewer/shallower graphs than
  Fable under identical context) → the premise holds; the recipe library is
  justified; proceed to the stratified A/B to size *how much* it closes.
- **Gap shrinks or vanishes** under matched conditions → much of the original
  observation was a harness-setting confound. Reframe: the win is mostly "make Opus
  reach for the workflow + hand it the decomposition menu," and the divergence/review
  recipes matter less than thought. Re-scope before investing further.
- **Either way** you now have a recorded, reproducible baseline — which the original
  anecdote never was.

## What this protects against

Shipping a large orchestration apparatus, claiming it "makes Opus orchestrate like
Fable," and never having checked that Opus *under the same harness* actually
orchestrated worse in the first place. That is exactly the unvalidated-repo failure
mode the chat critics called out.
