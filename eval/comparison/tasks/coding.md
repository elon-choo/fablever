# Coding task set (Axis A, headline domain) — candidate pool + selection rule

> **Round-2 review status: these are SPECS; the executable fixtures do not exist yet (finding C-1).**
> Pre-registration is **NOT sealable** until the full `tasks/coding/<id>/` tree (stub + `test.js` +
> planted files + a recorded SHA-256 of each) is committed AND each oracle is mutation-checked. The check
> command is the sole arbiter (§4b); the model's prose is irrelevant to scoring.

## Anti-tuning selection rule (fixes C-4)

To stop the task set being tuned into a tool-favorable band:

1. **Pre-commit a candidate POOL of 9 tasks** (below) with full fixtures, *before* any calibration or
   A0/A1 data.
2. Run calibration **once** under A0 only (k=3). **Deterministic drop rule:** drop a task iff its A0 pass
   rate is saturated (3/3) or floored (0/3). **No hand-picked replacements, no second calibration pass.**
3. Take the **first 6 surviving tasks in the fixed pool order** below. Commit the calibration run + all
   drop decisions. If fewer than 6 survive, the whole pool is enlarged by a pre-declared rule and
   re-frozen once — not iterated.

## Candidate pool (fixed order; first 6 survivors are used)

Every check is **executable**; no rubric escape hatch (m1). Each fixture ships a planted **wrong reference
solution** that the test must FAIL (mutation check) — committed as proof the oracle isn't a rubber stamp.

| # | id | prompt (verbatim) | executable check (pass = ) | how the check resists gaming |
|---|----|-------------------|----------------------------|------------------------------|
| 1 | C1-bugfix | "Fix the bug in `parse_range.js` so the included test passes. Change only what's needed." | `node test.js` exits 0 | test asserts behaviour on the boundary cases, not the diff |
| 2 | C2-refactor | "Refactor `dedupe.js` to remove the O(n²) lookup while keeping behaviour identical." | `node test.js` exits 0 | test asserts (a) identical output on a fixed corpus AND (b) an **injected comparison-counter stays sub-quadratic** on a large input — so `.forEach`/`.filter`/recursion that stay O(n²) FAIL; no `grep` (fixes C-2) |
| 3 | C3-safety | "`handler.js` reads a user-supplied path. Make it reject path-traversal payloads; the test exercises `../` attacks." | `node test.js` exits 0 (rejects `../etc/passwd` etc., still serves legit paths) | converted from a string-match quiz to a **reject-the-payload test** (fixes C-3); no line-number/label brittleness |
| 4 | C4-feature | "Implement `slugify(s)` in `slugify.js` to satisfy the spec tests (unicode, collapse dashes, trim)." | `node test.js` exits 0 (8 cases) | the 8 cases include 2 that a committed off-the-shelf slugify provably fails (evidence committed, fixes M-1) |
| 5 | C5-diagnose | "The test in `cache/test.js` fails. Fix the source so it passes. Do not edit the test." | `node test.js` exits 0 AND **SHA-256 of test.js matches the pinned hash** | hash recheck, not `git diff` (which `git checkout` defeats — fixes H-3) |
| 6 | C6-edgecase | "`split_csv.js` handles simple rows. Add support for **doubled-quote escaping with a custom `;` delimiter** (non-RFC), verified by the added cases." | `node test.js` exits 0 (incl. 3 custom-escape cases) | non-standard rule reduces memorization vs the classic CSV trap (fixes M-1) |
| 7 | C7-bounds | "Fix `ring_buffer.js` so wrap-around overwrite works; the test pins head/tail after overflow." | `node test.js` exits 0 | bespoke index arithmetic; test pins post-overflow state |
| 8 | C8-async | "`retry.js` should retry a flaky async fn with backoff, max 3 tries; the test injects failures." | `node test.js` exits 0 (fake timers) | test controls the clock; counts attempts exactly |
| 9 | C9-parse | "Make `eval_expr.js` respect operator precedence for + - * /; the test has mixed-precedence cases." | `node test.js` exits 0 | small bespoke expression set; precedence pinned |

**Scoring (§4b):** per surviving task, pass/fail from the check, averaged over k=3 → per-task pass rate;
headline = **A0 vs A1 pass rate across the 6 used tasks** (per-task reported in full).

**Before sealing, each fixture must show:** (1) the correct reference solution PASSES, (2) the committed
wrong reference solution FAILS (mutation check), (3) for C4, the committed off-the-shelf-slugify failure
log. Contamination notes are only valid if backed by such a committed artifact.
