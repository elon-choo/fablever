# Axis A coding-headline — RUN 2026-06-18 (real data; nulls included, nothing fabricated)

This is a filled instance of [`../../results-template.md`](../../results-template.md). The blank template
stays blank as the pre-registration. Numbers below are the actual output of the run; where a measurement
could not be obtained, it says so rather than guessing.

## Run metadata

| field | value |
|---|---|
| date | 2026-06-18 |
| solver model (pinned, both arms) | `claude-haiku-4-5-20251001` |
| Claude Code version | 2.1.181 |
| OS / machine | macOS (Apple Silicon), this host |
| harness | nested headless `claude -p`, `--permission-mode acceptEdits`; staged via `build-fixtures.mjs stage`, scored via `build-fixtures.mjs score` (committed oracle, clean temp dir) |
| coding fixture SHA-256 manifest | [`../../tasks/coding/manifest.sha256`](../../tasks/coding/manifest.sha256) |
| k (repeats/task) | 3 (A0); A1 could not complete — see below |
| N (tasks) | 9-task candidate pool (drop-to-6 never reached — see Headline) |
| env-diff A0 vs A1 | [`env-diff.txt`](env-diff.txt) — only the fablever layer differs |

## Axis A — HEADLINE: coding task success (§4b) → **UNDEFINED at this difficulty (valid null)**

**A0 (fablever layer neutralized: `FABLE_PROFILE=off` + `outputStyle=default`)** — 27/27 solves launched and
scored, all real:

| task | A0 pass rate (k=3) |
|---|---|
| C1-bugfix | 3/3 |
| C2-flatten | 3/3 |
| C3-safety | 3/3 |
| C4-feature | 3/3 |
| C5-diagnose | 3/3 |
| C6-edgecase | 3/3 |
| C7-bounds | 3/3 |
| C8-async | 3/3 |
| C9-parse | 3/3 |
| **aggregate** | **27/27 (9 tasks × 3)** |

**Consequence (the pre-registered rule firing as designed):** the deterministic drop rule
(`tasks/coding.md` §"Anti-tuning selection rule") drops every task whose A0 rate is saturated (3/3) or
floored (0/3). **All 9 are 3/3 → all 9 are dropped → zero surviving tasks → no discriminating headline can
be computed at this difficulty/model.** This is not a tool result; it is a **calibration null**: the
fixture set is too easy for a current Claude model (even Haiku, the weakest in the lineup, ceilings at
100%). A valid discriminating headline requires a **harder, pre-committed fixture set** (a task-design
iteration that must itself pass the adversarial review before sealing) — not more runs of this set, and not
swapping models to hunt for a favourable band (that would re-open the anti-tuning hole the protocol closed).

## Axis A — A1 (fablever ON) arm: **could not be measured by automation (separate from any tool effect)**

The A1 arm did **not** complete. Cause is a **harness limitation, not a fablever coding effect**, and must
not be reported as one:

- Nested headless `claude -p` spawning fails with **"claude native binary not installed"** after a handful
  of cumulative launches in a session. A0 ran first on a warm binary and got a clean 27/27; every later
  batch degraded after a few launches.
  - A1 (full fablever): **2/27** launched (C1, C2), the other 25 returned `status=null` in 0s (never launched).
  - A1-clean (fablever *style* on, maintenance env off, 1.5 s inter-spawn delay): **4** launched (C1, C2, C3, C6) before it failed again at the 5th — so the failure is **not** caused by fablever's hooks (the only registered ones are a UserPromptSubmit reminder + a SubagentStart hook; neither spawns processes) and is **not** fixed by delays. It is a cumulative nested-spawn race in `claude`'s own native-binary resolution.
- **Every A1 solve that actually launched PASSED** (C1, C2 under full fablever; C1, C2, C3, C6 under
  style-on) — **0 failures among 6 real A1 solves.** This is *directionally consistent with no
  degradation*, but n=6 and non-randomly truncated, so **it is reported as a hint, not a result.**

**Why this is the expected operating mode:** PROTOCOL §9 already says Axis A "needs a with/without-fablever
pair (two HOMEs, or install/uninstall)" run by the **operator** and that this "cannot be automated here."
This run empirically confirms why: the two conditions should be run as **real top-level Claude Code
sessions**, not 27 nested `claude -p` spawns. My A0 automation worked by luck of ordering; A1 did not.

## Axis A — manipulation check (§4a) — **not computed (insufficient A1 transcripts)**

Only 6 real A1 transcripts exist (vs 27 for A0), and on these trivial one-to-few-line tasks there is little
room for style to diverge, so a §4a table would be misleadingly precise. Qualitative note: A0 transcripts
include enthusiastic/­self-narrating forms ("Done! I've implemented…", bulleted recaps, exclamation marks);
the few A1 transcripts skew terser/outcome-first ("Fixed. Changed the loop condition…"), consistent with
the layer engaging — but this is an impression from n=6, not a measurement. A proper §4a check belongs on
the doc/planning domain (more prose surface), run by the operator.

## Axis B, §4c preference, doc/planning rubric — **not run (operator/owner steps)**

Unchanged from PROTOCOL §9: Axis B needs the operator's gpt-oauth/Gemini keys + a family-disjoint judge
panel; §4c and the doc/planning rubric need ≥2 judges including a non-Claude model + a human spot-check. I
am Claude and cannot stand in for the independent panel, so these are left for the operator rather than
self-judged.

## Negative / null results (required section)

1. **A0 ceilings at 100% (27/27)** → coding headline is undefined; fixture set too easy for current models. *(primary null)*
2. **A1 arm unmeasurable via nested-spawn automation** → the study is operator-run by design; automation hit a `claude` native-binary spawn race.
3. **No evidence of fablever harming coding success** in the 6 A1 solves that ran (all passed) — but underpowered; not a result.

## Next step to get a real headline

1. **Harden the fixtures** to a band a current model passes ~40–70% of (add genuinely harder tasks; e.g.
   multi-file refactors, subtle concurrency, spec-dense parsers), re-mutation-verify, and re-run the
   adversarial review before sealing — the anti-tuning rule requires the pool be frozen before data.
2. **Run the two conditions as real Claude Code sessions** (install vs uninstall, or two `CLAUDE_CONFIG_DIR`
   homes), capturing the env-diff per PROTOCOL §2 — not nested `claude -p`.
