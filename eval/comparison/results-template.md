# fablever Comparison Study — RESULTS (template; fill with real data, never fabricate)

> Committed empty as part of pre-registration. Fill **after** runs with real numbers, **including nulls
> and negatives**. Do not change metrics or tasks post-hoc. Headlines are labelled; everything else is
> explicitly descriptive/directional (per `PROTOCOL.md` §0).

## Run metadata

| field | value |
|---|---|
| date | _(fill)_ |
| model + version | _(e.g. claude-opus-4-x)_ |
| Claude Code version | _(fill)_ |
| OS / machine | _(fill)_ |
| RNG seed (order + L/R) | _(fill)_ |
| env-diff A0 vs A1 | _(link to `runs/<date>/env-diff.txt` — must show ONLY fablever differs)_ |
| coding fixture SHA-256 manifest | _(link to `tasks/coding/manifest.sha256` — pins each oracle; post-hoc edits detectable)_ |
| k (repeats/ task) | 3 |
| N (tasks/domain) | 6 |

## Axis A — HEADLINE: coding task success (§4b)

| task | A0 pass rate (k=3) | A1 pass rate (k=3) |
|---|---|---|
| C1-bugfix | _/3 | _/3 |
| C2-refactor | _/3 | _/3 |
| C3-safety | _/3 | _/3 |
| C4-feature | _/3 | _/3 |
| C5-diagnose | _/3 | _/3 |
| C6-edgecase | _/3 | _/3 |
| **aggregate pass rate** | **_ / 18** | **_ / 18** |

**Headline conclusion (≤ what N supports):** _(fill — e.g. "no significant difference at n=6" is a valid,
publishable result)_

## Axis A — manipulation check (§4a) — DESCRIPTIVE, NOT A RESULT

> Confirms the layer engaged (A1 should differ from A0). A move here is tautological, never evidence.

| metric | A0 | A1 | note |
|---|---|---|---|
| median words / assistant msg | _ | _ | layer-on check |
| tool:text ratio | _ | _ | |
| caveat density (/100 words) | _ | _ | |
| self-narration % ("I'll/Let me") | _ | _ | |
| ended-turn-on-question rate | _ | _ | |
| over-build proxy (extra files/abstractions) | _ | _ | manual count |

> **Caption (required):** the tables below are **descriptive only and NON-BLIND (length+substance
> visible)**. If the §4b headline above is null, these **cannot** be presented as the study outcome
> (PROTOCOL §0). Fill the headline-conclusion cell first.

## Axis A — pairwise preference (§4c) — DESCRIPTIVE, NON-BLIND

| dimension | A0 wins | A1 wins | tie | "condition leaked" excluded |
|---|---|---|---|---|
| (i) task success | _ | _ | _ | _ |
| (ii) decisiveness | _ | _ | _ | _ |
| (iii) outcome-first | _ | _ | _ | _ |
| (iv) restraint | _ | _ | _ | _ |

Judges: _(list, incl. the non-Claude one)_ · inter-judge agreement: _ · human spot-check notes: _

## Axis A — doc/planning rubric — DIRECTIONAL COLOR ONLY

| task | A0 rubric mean (1–5) | A1 rubric mean (1–5) |
|---|---|---|
| D1…D6 | _ | _ |

## Axis B — cross-model verify (scoped: preset comparison on the fixed author fixture)

> Inherits all of `whitepaper/06-limitations.md`. No new defect-catch claim beyond the existing 16/18.

| condition | recall (HEADLINE) | precision | incremental recall vs B0 | calls | tokens | wall-clock |
|---|---|---|---|---|---|---|
| B0 claude-only | _ | _ | — | _ | _ | _ |
| B1 gpt-oauth | _ | _ | _ | _ | _ | _ |
| B2 gpt-api+gemini-api | _ | _ | _ | _ | _ | _ |

Judge panel (families **disjoint** from reviewers under test): _ · per-family agreement: _ · human
spot-check: _ · family-overlap bias pre-registered? _(yes/no — if a disjoint panel was unavailable)_

**Axis B conclusion (scoped):** _(fill — incremental recall is the question, not absolute recall)_

## Negative / null results (required section — do not leave empty if any occurred)

_(List every metric that showed no effect or went against the tool. This section existing and populated is
itself a credibility signal.)_
