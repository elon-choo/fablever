# Baseline validity — is "plain Opus" (A0) actually plain, given fablever is installed globally?

A fair objection to every result here: this machine has fablever installed **globally** (`~/.claude/settings.json`
sets `outputStyle: "Fable"` plus a `UserPromptSubmit` reminder hook and a `SubagentStart` hook). If the A0 ("plain
Opus") arm still received any of that, the whole A0-vs-A1 comparison would be fablever-vs-fablever and invalid.

It does not. A0 is instantiated as `FABLE_PROFILE=off` (env) **+** `--settings '{"outputStyle":"default"}'`, and both
fablever vectors are empirically neutralized:

## Vector 1 — the reminder hook (context injection)
`~/.claude/hooks/fable-reinject.sh` gates on the env flag at the top (`[ "${FABLE_PROFILE}" = "off" ] && exit 0`),
and `fable-subagent.js` does the same (`if (process.env.FABLE_PROFILE === 'off') process.exit(0)`). Measured by
running the hook directly with identical stdin:

| condition | bytes injected into context |
|---|---|
| `FABLE_PROFILE=off` (A0) | **0** |
| `FABLE_PROFILE` on (A1) | **912** (starts: "**Fable working style (reminder).** Act when you have enough…") |

A0 receives **zero** Fable steering from the hooks.

## Vector 2 — the always-on output style
`--settings '{"outputStyle":"default"}'` overrides the global `outputStyle: "Fable"`. Proof is in the produced
behavior — the markdown-scaffold gap between arms across all 192 generated responses:

| arm | headers / reply | bullets / reply | words / reply |
|---|---|---|---|
| A0 (plain) | 3.1–3.6 | 4.8–6.2 | 385–413 |
| A1 (fablever) | 0.8–1.0 | 2.8–3.5 | 328–344 |

A0 carries **~3.5× the markdown scaffolding** of A1. That gap can only exist if the style override took effect — if
the global Fable style had leaked into A0, A0 would look answer-first/prose like A1. It does not.

## Other global state (does not differentially bias)
The global `~/CLAUDE.md` / `~/.claude/CLAUDE.md` user instructions and any globally-configured MCP load **equally** into
both arms (both are nested `claude -p` on the same machine), so they cannot explain an A0-vs-A1 difference. Only the
two fablever vectors above differ between arms, and both are off in A0.

## Conclusion
A0 is genuinely plain Opus; A1 is a genuine full fablever install (output style + reminder hook + subagent hook). The
comparison measures exactly what it claims: **plain Opus vs fablever, same base model.** "fablever is global, so you
can't test plain Opus" is false — fablever is built to switch off (`FABLE_PROFILE=off` + style override), verified here.

Reproduce: `printf '{"session_id":"x","transcript_path":""}' | FABLE_PROFILE=off bash ~/.claude/hooks/fable-reinject.sh | wc -c`
(→ 0) vs the same without the env flag (→ ~912).
