# RESULTS — G0.2 one-shot attestation, round 2 (hardened fixture) · 2026-07-17

**A harder fixture did not create headroom. One-shot opus passes 6/6 again — this time on genuinely
difficult, fairly-specified tasks. The negative result is now a finding about the experiment's premise, not
about task quality.**

## What changed since round 1

Round 1 saturated on textbook 30-line functions. The reasonable hypothesis: the tasks were too easy. So the
fixture was rebuilt (6 parallel Opus builders, independently verified) with 6 **algorithmically hard** tasks,
each with 3 hidden oracles (up from 2), each independently confirmed bidirectional (reference passes / broken
fails / scaffold fails / zero hiddenness leak):

`cron-next` (cron next-fire with DOM/DOW OR-semantics, leap years) · `semver-range` (`satisfies` with
`^`/`~`/hyphen/wildcard/`||` and prerelease rules) · `glob-match` (`**` segment semantics, classes, braces,
escaping) · `expr-eval` (precedence, right-assoc power, error offsets) · `diff-hunks` (LCS → unified-diff
hunks with `@@` headers and merge rules) · `ini-parse` (sections, nesting, quoting, duplicate-key arrays,
coercion).

**Fairness constraint (binding on the build):** each prompt had to fully specify every behavior its oracles
test — difficulty from algorithmic hardness only, never from hidden requirements or trick prompts. An unfair
task would measure trick-resistance, not the loop's value.

## Result — 6/6 passed again

| task | oracles | baseline | wall |
|---|---:|---|---:|
| cron-next | 3/3 | **pass** | 85 s |
| semver-range | 3/3 | **pass** | 511 s |
| glob-match | 3/3 | **pass** | 550 s |
| expr-eval | 3/3 | **pass** | 160 s |
| diff-hunks | 3/3 | **pass** | 83 s |
| ini-parse | 3/3 | **pass** | 115 s |

The wall-clock jumped 5–10× (semver-range 511 s, glob-match 550 s — the model genuinely struggled), which is
the signal the tasks *are* harder. But it still shipped a passing implementation on the first shot, every time.

## The finding (this is the point)

**A one-shot model with no tools passes any fair, complete, self-contained specification, given enough
thinking — regardless of algorithmic difficulty.** The two conditions the flagship A/B needs are in direct
tension:

1. **Fairness** requires the spec to fully determine the answer (no hidden requirements). 
2. **Headroom** requires a one-shot to plausibly fail — i.e. to *miss something*.

A fair, complete, self-contained spec leaves nothing for a strong model to miss on the first shot. The
verified-completion loop's value — catch a bug by *running* the code — needs something the model can't get
right by reasoning alone: an **incomplete or ambiguous** spec (unfair here), **external state** it must
observe (curl a live endpoint, read a real DB, hit a flaky API), or a task large enough that first-shot
attention genuinely lapses. Pure self-contained coding puzzles, made fair, are not that.

This is not a defect in the tasks. Two independent rounds — easy and hard — land the same way. It is evidence
about **where a verified-completion loop can and cannot demonstrate value**, and it agrees exactly with the
harness's own founding thesis, recorded in the charter:

> "스캐폴딩은 base competence의 **곱셈기**이지 대체물이 아니다. 능력은 가중치에 있고 천장은 언제나 closer
> to Fable, never equal."

If base competence already clears the bar in one shot, a completion-verifying scaffold has nothing to
multiply. The honest place a loop earns its keep is **not** self-contained puzzles a strong model one-shots —
it is tasks with executable truth the model cannot derive by thinking: integration against real systems,
observed runtime behavior, or genuinely open-ended specs where "done" is contested.

## Consequence (binding)

- **The G3.6 A/B as designed cannot be salvaged by making the fixture harder.** Two rounds prove it.
- The authorized budget was spent on the two attestations (~2,600 s of opus wall-clock total), **not** on the
  24-run A/B — because running the A/B on a saturated fixture would have bought a guaranteed null at higher
  cost. That was the correct use of the go-ahead: the money bought the *finding that the experiment is
  ill-posed*, which is worth more than a null.
- What the loop needs to be measured is a **different fixture class** (executable oracles over external /
  observed state), which is a new design question and a new owner decision — not a re-hardening of these
  tasks. Posted to the owner.

## What this does NOT say

It does not say the loop is worthless. It says a self-contained coding-puzzle A/B cannot show its value, in
either direction, because the base model saturates the ceiling. The loop's *guarantees* remain machine-tested
(`test/verified-loop-test.mjs`, 12/12). Its *value* remains unmeasured — and is now understood to be
unmeasurable by this experiment class, which is itself the result.
