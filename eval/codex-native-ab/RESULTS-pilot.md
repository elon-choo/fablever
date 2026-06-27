# codex-native-ab — pilot run (instrument validation)

**Run:** 2026-06-27 · 2 smoke tasks × 5 arms = **10 real `codex exec` runs** (codex-cli 0.141.0), via the
operator's existing `~/.codex` login. The harness read/copied **no auth** (it points `codex` at a home it
never opens). Scored with `score.mjs` against the frozen oracle (`oracle/VERSION.json` @ `3bd8b3b`).

## What this pilot was for

Not to measure fablever — with n=2 it **cannot**. It checks two things: (1) does the instrument run
end-to-end against real Codex, and (2) do the tasks *discriminate* (does plain Codex actually trip on them,
leaving room for a fablever arm to differ)?

## Result

**(1) Instrument: validated.** All 10 runs completed (`codex_exit=0`), the `--json` event stream parsed,
the production-file diff + behavioral `acceptance` (`node test.js`) + the frozen unsupported-claim oracle all
scored, and the hook-trust gate correctly flagged the H/S arms as `UNVERIFIED` (interactive `/hooks` trust was
not performed, so those arms effectively ran without hook injection).

**(2) Tasks: they do NOT discriminate (yet).** Every arm passed every outcome on both tasks, so `score.mjs`
reports **0 discordant pairs on all four contrasts × four outcomes → underpowered**, and refuses a verdict
(`PILOT/DESCRIPTIVE ONLY — 2 < 12 scored tasks`):

| | scope-001-stripped (fix in scope) | nochange-001 (leave it alone) |
|---|---|---|
| **plain Codex (B)** | fixed only `src/parser.js`, acceptance ✓, cited `node test.js` | changed nothing, acceptance ✓ |
| A / M / H / S | identical to B | identical to B |

Plain Codex already: fixed the off-by-one **within scope**, **verified** it (so the frozen oracle scored
**0** unsupported-claims — it cited evidence unprompted), and correctly **left the no-change task untouched**
(no action bias). There is no headroom for AGENTS / MCP / hooks / skills to show an effect on tasks a strong
model already aces.

## Honest read

This is the expected, informative pilot outcome: **the task set must be made HARDER before the experiment can
detect anything.** A discriminating task is one where a *capable* model still trips — e.g. a scope boundary
that is implied but not stated (`consent_stripped`), an already-fixed bug that tempts an unnecessary rewrite,
a deliverable whose "done" is easy to assert without running anything. Authoring that ≥12-task pilot set
(then confirming it trips plain Codex, then freezing it) is the next step. Caveats stand: n=2, one model, one
Codex version, H/S hook-trust unverified.

Reproduce: `node eval/codex-native-ab/run.mjs --codex-home=~/.codex && node eval/codex-native-ab/score.mjs`
(makes real, billed Codex calls; the run artifacts under `out/` are git-ignored).
