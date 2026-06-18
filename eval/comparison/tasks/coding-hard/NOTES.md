# Hard coding pool — purpose, review, status

## Why this exists
The original easy pool (`../coding/`) **saturated**: the 2026-06-18 run had A0 = 9/9 on every task, so
the deterministic drop-to-6 rule dropped all tasks and the Axis-A coding headline was undefined
(`../../runs/2026-06-18/RESULTS.md`). This pool replaces it with 9 harder tasks whose difficulty lives in
**under-specified corners an approximate/recalled solution gets wrong** — to create the ~40–70% headroom
PROTOCOL §3 requires.

## The 9 tasks (each: stub + hidden solution + hidden wrong + executable oracle)
H1 semver compare incl. pre-release precedence · H2 Kahn topo-sort + cycle detection · H3 merge-intervals
insert (touching merges) · H4 LRU (get refreshes recency) · H5 deep path-set (arrays for `[i]`) · H6 token
bucket (refill capped at capacity, starts full) · H7 Roman parse with canonical-form validation · H8 edit
distance with substitute-cost-2 · H9 expression eval with parens + unary minus + trunc-toward-zero division.

All 9 pass the mutation triad (stub FAILS / solution PASSES / wrong FAILS): `node build-fixtures.mjs verify`
→ "ALL FIXTURE ORACLES SOUND". Run mechanics identical to the easy pool: `stage <dir>` emits stub +
PROMPT.txt only; `score <dir>` runs the committed oracle in a clean temp dir.

## Adversarial review (red-team-validator) — FIX-THEN-GO, gate 62/100 → fixes applied
- **C-1 (purpose-defeating): stubs leaked `// BUG: …` comments naming the exact defect**, and the tasks are
  textbook → likely re-saturation. **Fixed:** stripped every `// BUG:` label from the staged stubs (the
  model must now diagnose, not be handed the bug). `stage` output now contains zero "BUG" hits. The
  remaining saturation question is settled by calibration (below), not assertion.
- **M-1 (false-accept): H9 accepted `Math.round` division** (only `(0-7)/2` was tested, where round==trunc).
  **Fixed:** added `7/2 = 3` (Math.round(3.5)=4) so only trunc-toward-zero passes.
- **M-2 (false-reject): H6 penalized a spec-faithful "starts empty" reading.** **Fixed:** the prompt now
  states the bucket **starts full (capacity tokens)**.
- **m-2 (contamination note missing):** added a contamination/memorization note in `build-fixtures.mjs`
  header (textbook problems; mitigated by the A0-vs-A1 within-task difference design + de-labelled stubs).
- **m-1 (uncommitted/orphaned):** this pool is committed as a **fresh pre-registration**, frozen before its
  own calibration; the calibration result below is informational and the tasks were **not** tuned to it.

## Known, accepted limitations (not silently closed)
- **Lookup-table cheats are not executably blocked** (M-3) — the anti-hardcoding clause is prose; a literal
  input→output table passes. Mitigation is the headline being an A0-vs-A1 *difference on the same tasks*
  (uniform cheating cancels) plus operator inspection of solutions. A task cleared purely by hardcoding
  contributes no signal and washes out in the diff.
- **Oracle-tightness beyond the triad** was spot-checked, not exhaustively cleared for H2/H5/H7/H8.
- **Full automation of the A1 arm is blocked** by the nested-`claude` native-binary spawn race documented in
  `../../runs/2026-06-18/RESULTS.md` — the operator must run the two arms as real Claude Code sessions.

## Difficulty calibration (A0, Haiku) — **the hard pool ALSO saturates; harder-textbook is not the fix**
Frozen before calibration; tasks were NOT tuned to the result.

- **k=1** (`../../runs/2026-06-18/hard-A0-cal/`): 9/9 real solves, **all pass**.
- **k=3** (`../../runs/2026-06-18/hard-A0-cal-k3/`): of 27 attempts, **18 actually launched** (the other 9
  hit the nested-`claude` native-binary spawn race — `status=null` in 1s, a *failed launch*, not a task
  failure) and **all 18 passed.** ⚠️ The raw `results.json` there shows misleading per-task fractions
  (e.g. `2/3`, `1/3`) because the runner scores a failed launch as a non-pass; the true pass rate **among
  launched solves is 18/18 = 100%** (`grep "solved status" cmp-hard-k3.log` distinguishes them).
- **Net: 27/27 real solves passed across both passes — zero genuine failures.**

**Conclusion (honest, against the pool's purpose):** building *harder textbook* tasks did **not** create
headroom. Haiku — the weakest current model — ceilings on every one of these self-contained, single-file
algorithmic tasks. The saturation is at the **task-class level**, not the per-task-difficulty level. An
executable coding-pass-rate headline (PROTOCOL §4b) therefore cannot discriminate A0 vs A1 on this class of
task with any current Claude model. This is consistent with the project's own honesty framing ("style
transplant, not capability transplant"): a working-*style* layer is not expected to move an objective
single-task pass rate that already sits at ceiling. Getting a discriminating coding headline would require a
fundamentally different task class (multi-file / long-context / genuinely ambiguous / research-level), not a
harder algorithm — and the §9 spawn-race limit means even that must be operator-run as real sessions.
