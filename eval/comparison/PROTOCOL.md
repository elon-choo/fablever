# fablever Comparison Study — Protocol (pre-registration, v0.2)

**Status:** TWO adversarial methodology reviews done; all must-fix items incorporated. Round 1 (protocol):
FIX-THEN-GO → incorporated. Round 2 (task set + rubric + runner): NO-GO → design fixes incorporated AND
the GO-blocker (round-2 C-1: the executable coding-fixture tree) is now **built and mutation-verified** —
`tasks/coding/build-fixtures.mjs` proves every oracle sound (stub fails / solution passes / wrong fails,
all 9), with SHA-256 pins in `tasks/coding/manifest.sha256`. **Round 3 (confirmation): FIX-THEN-GO (score
90)** — all five round-2 must-fixes confirmed resolved; its two Major items (anti-hardcoding prompt clause,
clean `stage`/`score` mechanism) are now applied (§9, Appendix A), meeting the reviewer's stated GO
condition. **This DRAFT seals as a pre-registration on the operator's calibration run** (A0, one pass,
deterministic drop-to-6); calibration and the Axis-B disjoint panel are run-time steps, not seal-blockers.
**Rule:** this protocol + the frozen tasks + the empty results template are committed *before* any data.
Results (including null/negative) are committed after, unedited. No metric or task is added or dropped
after seeing data. Consistent with [`EVIDENCE.md`](../../EVIDENCE.md)'s honesty contract.

## 0. Claims, and the headline discipline

- **Axis A claim (style):** fablever's always-on layer makes the *same* model **more likely to pass an
  objective task check** while shifting its working style toward Fable's — *without lowering task success*.
- **Axis B claim (verify):** adding a different-lab reviewer (GPT, then GPT+Gemini) to the deep-review
  loop catches **incremental** planted defects a Claude-only panel misses **on the fixed author fixture**.
- **NOT claimed:** any productivity-magnitude number, capability uplift, or generalization beyond the task
  set. Small-N, single-operator demonstration → directional evidence only.

**Headline discipline (load-bearing, from the review).** Exactly ONE headline metric per axis:
- **Axis A headline = objective coding-task success rate (§4b).** Nothing else may be reported as the
  result.
- **Axis B headline = recall on the fixed author fixture (§5), explicitly scoped, no new defect-catch
  claim beyond the existing 16/18.**
- **Everything else is descriptive/directional only and can NEVER be a headline:** the style metrics
  (§4a) are a *manipulation-check*; the blinded preference (§4c) is *non-blind by construction* (see C2);
  the doc/planning domain is *softer-signal color*. These are reported in full, win or lose, but no
  conclusion rests on them.

## 1. Two independent axes (do NOT collapse into one 4-way comparison)

The four operator-requested configs measure different things. Collapsing them conflates a *style* effect
with a *review-accuracy* effect.

| Axis | Conditions | What differs | Where it shows up |
|---|---|---|---|
| **A — working style** | A0 baseline (no fablever) · A1 fablever default (claude-only) | always-on output style + hooks | every task |
| **B — cross-model verify** | B0 claude-only · B1 gpt-oauth · B2 gpt-api+gemini-api | which reviewer models run in the verify loop | deep-review tasks only |

> Axis B does **not** change ordinary output — running B0/B1/B2 on a normal coding task and comparing the
> prose would show ~no difference and falsely read as "no effect." Axis B is measured on a defect-catch
> review task only (§5).

## 2. Held-fixed variables, and "only fablever differs" must be *verified*

- **Model + version** pinned and recorded (e.g. `claude-opus-4-x`); identical across conditions.
- **Settings** identical: effort level, temperature/defaults, Claude Code version, OS/machine.
- **Operator** issues identical prompts verbatim from the frozen task files; no mid-run tuning.
- **Manipulation check (not just an assertion):** for A0 vs A1, **diff the two environments** (output
  style, hooks list, MCP servers, settings.json) and **commit the diff** with the run, proving the
  fablever layer is the *only* delta. A run whose env-diff shows other differences is discarded, not
  patched. `/config` must show Fable on (A1) / off (A0).

## 3. Task domains, frozen task counts (no optional stopping)

Two domains, **frozen and committed before any run**. **N is pre-committed: 6 tasks per domain = 12.**
Scaling up is allowed only to a *pre-declared larger N*, never "until it looks significant" (closes the
optional-stopping hole). The **experimental unit is the task** (6 per domain), not the repeat (§4).

- **Coding** (`tasks/coding.md`) — every task ships an **executable pass/fail** check (compiles / unit
  test green / exact-match answer). **No rubric escape hatch:** a task that can only be rubric-scored is
  moved to the doc/planning domain. Difficulty is calibrated (a mix the base model passes ~40–70% of, so
  there is headroom in both directions) and each task carries a contamination/memorization note.
- **Doc / planning** (`tasks/doc-planning.md`) — spec/PRD, migration plan, tradeoff memo, "should we do
  X?" decision. Rubric-scored (no executable check exists) → **directional color only, carries no
  headline** (per §0).

## 4. Axis A measurement — working style

Each (task × condition) is run **k=3** times in fresh sessions. **k=3 is for per-task variance/stability
ONLY — it does NOT inflate N.** The analysis unit stays the task (n=6/domain); the three repeats are
summarized to a per-task value with its spread.

**4a — Style metrics = MANIPULATION CHECK ONLY (not a win condition).** Computed by `run-style.mjs`
reusing [`tools/fable-leaktest.js`](../../tools/fable-leaktest.js): words/msg, tool:text ratio, caveat
density, self-narration %, ended-on-question rate, over-build proxy. **These are the exact tokens the
style layer is built to change, so a move here is tautological, not evidence** (the leaktest's own header
concedes they are "surface proxies… not correctness"). Purpose here: confirm the layer actually engaged
(A1 should differ from A0 on these) — **no headline may rest on any §4a metric.**

**4b — Objective outcome = THE HEADLINE.** Coding tasks: the executable check (test passes / exact
answer) → pass/fail, automatic. Reported as **A0 vs A1 pass rate across the 6 coding tasks.** This is the
only Axis-A result that can be stated as a conclusion.

**4c — Preference is NON-BLIND by construction; descriptive only.** fablever's terseness/outcome-first
shape *leaks the condition on sight*, so "blinded" L/R judging is cosmetic. Mitigations, all required:
(i) **format-normalize** transcripts before judging (strip length/markdown/opener tells where feasible);
(ii) where normalization can't hide it, this metric is pre-registered **non-blind → descriptive only**;
(iii) judges record **free-text rationale** so a leaked-condition tell ("the terse one is obviously the
tool") is auditable; (iv) use **≥2 judges including a non-Claude model**, anchored to *task success*, not
style. No headline rests on §4c.

> **Honest limit of the normalization (round-2 H-1):** stripping openers + markdown removes only *some*
> tells — **length and substance stay visible**, and dimensions (ii) decisiveness / (iii) outcome-first
> ARE the style signature, so a judge scoring them is partly re-reading §4a's manipulation-check, not an
> independent preference. Every §4c win-rate is therefore labelled "NON-BLIND (length+substance visible)"
> in the results, and **cannot upgrade a null §4b headline.**

## 5. Axis B measurement — cross-model verify (scoped)

Reuses the existing harness ([`eval/fixtures/`](../fixtures/) author-planted defects + the cross-model
panel + [`eval/ultra/score.mjs`](../ultra/score.mjs)), and **inherits all of its limitations**
([`whitepaper/06-limitations.md`](../../whitepaper/06-limitations.md)): n=6, author-planted, single
generation run, precision is a floor. **Axis B is therefore a *preset comparison on a fixed author
fixture*, not a new defect-catch result** — no claim beyond the existing 16/18.

- Run the verify loop under B0/B1/B2 on the same artifacts. Metric: **recall (headline), precision,
  and incremental recall** each added reviewer contributes over B0. Record **cost: model calls, tokens,
  AND wall-clock** (cost-direction is a standing open item in EVIDENCE.md §4 — named here, not closed).
- **Judge independence (must-fix M1):** the default ultra panel is GPT-5.5×4 + Gemini-3.1-pro×1 — the
  *same families as the reviewers under test in B1/B2*, which would inflate the incremental recall
  credited to them. So Axis B is judged by a panel whose families are **disjoint from the reviewer under
  test** (add a Claude judge + a human spot-check of a subset), and **per-family judge agreement is
  reported** so the conflict is visible. If a fully-disjoint panel isn't available, the family-overlap
  bias is pre-registered as a known directional bias favoring B1/B2.
- *(Optional stretch, not required for GO):* add an independent (non-author-planted) fixture; if added, it
  is frozen and committed before runs like everything else.

## 6. Threats to validity — status

| Threat | Handling |
|---|---|
| Circular style metric (C1) | §4a demoted to manipulation-check; no headline rests on it |
| Unblindable judge (C2) | format-normalize + pre-register preference as non-blind/descriptive; headline = objective check |
| Axis-B judge non-independence (M1) | disjoint-family panel + Claude judge + human spot-check + per-family agreement, or pre-registered bias |
| Saturated author fixture (M2) | Axis B scoped as preset comparison, inherits all limitations, no new claim |
| Pseudo-replication / small N (M3) | task is the unit; k=3 = variance only; N pre-committed; all secondary dims reported in full |
| Self-preference bias | primary metrics anchored to objective success; non-Claude judge in the panel |
| Order/position effects | randomize task order + L/R; record the seed |
| Condition leakage / env drift (m3) | env-diff committed per run (§2) |
| Optional stopping (m5) | N frozen in §3; scale-ups only to a pre-declared larger N |
| Cost-direction (m4) | wall-clock recorded; named as an open item, not closed |

## 7. Pre-registration & analysis

1. Commit this protocol + frozen `tasks/coding.md` + `tasks/doc-planning.md` + `rubric.md` +
   `results-template.md` **first**. The task files + rubric must themselves pass the adversarial review
   before the registration is **sealed** (they are the largest remaining credibility surface).
2. Run; capture raw transcripts + env-diffs under `runs/<date>/<condition>/`.
3. Fill `results-template.md` with real numbers — headline (coding pass rate; Axis-B recall) plus every
   secondary metric in full, **including nulls/negatives**. No post-hoc metric changes.
4. Conclusion must not exceed what N supports; descriptive metrics stay labeled descriptive.

## 8. Repo layout

```
eval/comparison/
  PROTOCOL.md           # this file (pre-registered)
  tasks/coding.md       # frozen coding tasks + EXECUTABLE success checks
  tasks/doc-planning.md # frozen doc/planning tasks (rubric; directional-only)
  rubric.md             # blind-judge rubric, normalization + scoring instructions
  run-style.mjs         # loads transcripts, computes §4a manipulation-check metrics, builds judging packet
  results-template.md   # empty tables to fill with real data
  runs/                 # raw transcripts + env-diffs per condition (added at run time)
```

## 9. What the operator must run (cannot be automated here)

- Axis A needs a **with/without-fablever pair** (two HOMEs, or install/uninstall) **plus the committed
  env-diff** proving only fablever differs.
- **Coding tasks are staged and scored, never hand-judged (round-3 R3-2/R3-3):**
  1. `node tasks/coding/build-fixtures.mjs stage <dir>` — emits each task as **stub + PROMPT.txt only**
     (no `test.js`, no `refs/`), so the model under test never sees the oracle or the answer. The
     PROMPT.txt carries the verbatim prompt + the anti-hardcoding clause (R3-1).
  2. The model edits the stub in `<dir>/<id>/` (k=3 fresh runs per task per condition).
  3. `node tasks/coding/build-fixtures.mjs score <dir>` — runs the **committed** oracle per task in a
     clean temp dir and re-checks C5's `test.js` SHA-256. Its `PASS/FAIL` per task **is** the §4b headline
     data. (Staging means the model can't edit `test.js`, so C5's "don't edit the test" is enforced
     structurally; the hash check is belt-and-suspenders.)
- **Calibration (one A0 pass, deterministic drop-to-6)** and the **Axis-B disjoint-judge panel** (needs
  the operator's gpt-oauth/Gemini keys + a Claude judge + a human spot-check) are legitimate run-time
  steps, not seal-blockers.
- The operator captures transcripts + env-diffs + the `score` output under `runs/<date>/<condition>/`.

---

## Appendix A — methodology review log

- **v0.1 → adversarial review (red-team-validator), verdict FIX-THEN-GO.** Findings incorporated:
  C1 (circular style metric → manipulation-check), C2 (unblindable judge → normalize + descriptive-only,
  objective check is the only headline), M1 (Axis-B judge family-overlap → disjoint panel / pre-registered
  bias + human spot-check), M2 (author fixture → scope as preset comparison, no new claim), M3
  (pseudo-replication → task is the unit, k=3 variance-only, N pre-committed). Minor m1 (no rubric escape
  hatch in coding), m2 (doc/planning no headline), m3 (env-diff committed), m4 (wall-clock + cost named
  open), m5 (no optional stopping) also applied.
- **v0.2 → round-2 adversarial review (task set + rubric + runner), verdict NO-GO.** Design fixes
  incorporated: C-2 (C2 gameable `grep` → test-enforced behaviour + sub-quadratic counter), C-3 (brittle
  string-match → reject-the-payload test), C-4 (task-tuning hole → pre-committed 9-task pool + deterministic
  drop-and-take-first-6, one calibration pass), H-1 (normalization is partial → §4c labelled NON-BLIND,
  decisiveness/outcome-first noted as re-encoding the signature), H-2 (runner denominators aligned to
  text-bearing msgs; over-build marked manual not script-computed), H-3 (C5 `git diff` → pinned SHA-256;
  oracles mutation-checked), M-1 (contamination notes require a committed artifact), M-2 (seeded task-order
  shuffle added to the runner), M-3 (results template captions descriptive tables as unable to upgrade a
  null headline), L-1 (bullet-strip restricted to list markers).
- **RESOLVED (round-2 C-1):** the `tasks/coding/<id>/` fixture tree is built by `build-fixtures.mjs`
  (stub + `test.js` + `refs/`), every oracle mutation-checked (stub fails / solution passes / wrong fails,
  all 9 sound), SHA-256 pinned in `manifest.sha256`. C2 was swapped from a complexity-refactor (not
  robustly unit-testable in JS) to a deep-flatten correctness task; C3 is a reject-the-payload test; C5
  uses a clock-injected expiry; all checks are executable with no rubric/`grep` escape hatch.
- **v0.3 → round-3 confirmation review, verdict FIX-THEN-GO (score 90).** All five round-2 must-fixes
  confirmed RESOLVED (C-1 independently re-verified). Two Major items applied: R3-1 (anti-hardcoding clause
  baked into every staged PROMPT.txt), R3-2 (`stage` mode emits stub+prompt only — model never sees the
  oracle/answer), R3-3 (`score` mode runs the committed oracle per task + C5 hash recheck). The reviewer's
  stated GO condition ("apply the prompt clause + clean-staging + run-time scoring into §9") is now met.
- **Seal step:** the calibration run (A0, one pass, deterministic drop-to-6) on the operator's machine.
  Calibration + the Axis-B disjoint panel are run-time steps, not seal-blockers.
