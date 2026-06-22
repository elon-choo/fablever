# 8 · Experiment log — the actual path to these numbers

This is a dated lab notebook of the experiments that produced this whitepaper, **including
the ones that failed or went against the project.** It exists because a transparent,
reproducible experiment trail — with its negative results and course-corrections left in —
is a stronger credibility signal than any polished claim. Every figure here is checkable
([§7](07-reproduce.md)) — the candidate/confirmed counts **offline** via `eval/ultra/score.mjs`,
the recall/precision by re-running the committed `eval/ultra/` scripts with your own keys (a live
model call, so expect small variance); every negative result is reported, not buried.

Read this as: *here is exactly what was tried, what it showed, and what we changed our mind
about.* If the process looks rigorous, that is the evidence. If it looks flawed, that is a
finding — open an issue.

---

## Experiment 1 — A/B on the seed fixture · 2026-06-15 · **negative result, kept**

- **Question.** Does a parallel adversarial panel catch more planted defects than one strong
  agent, at justifiable cost?
- **Method.** Workers Claude **Opus + Sonnet** (model-swap as placebo control), independent
  non-Claude judge **GPT-5.2**, seed fixture (n=2), 60 worker agents, 0 judge errors.
- **Result.** **The panel lost.** The single strong agent already caught ~all defects
  (ceiling effect — the fixture was saturated), so panel recall ≈ single recall, while
  `caught_per_agent` ≈ **0.6 (panel) vs ≈ 3.0 (single)** — a **~5× cost regression that
  persisted across the Opus→Sonnet swap** (model-invariant ⇒ structural, not a one-model
  placebo).
- **Decision.** Disclosed the negative result. Concluded the seed fixture had no headroom
  and **built a harder one** — rather than quietly re-running until the answer flattered the
  panel.

## Experiment 2 — A/B on a hard fixture with controls · 2026-06-15 · **the decisive one**

- **Question.** With real headroom, *which factor* drives any recall gain — parallel
  structure, the lens taxonomy, or just the number of draws?
- **Method.** New fixture: 6 dense artifacts, 18 subtle planted defects, stratified
  **a** (contradiction) / **b** (omission) / **c** (deep-reasoning). Four arms — baseline,
  **prompt-matched** (1 agent, all lenses, one context → isolates the taxonomy),
  **draw-matched** (N generic draws, union → isolates draw count), and the **panel**. 156
  worker agents, GPT-5.2 judge.
- **Result.** The panel beat the single *baseline* only slightly (Opus 15 vs 14, Sonnet
  15 vs 13 / 18) **but did NOT beat its own controls** — the prompt-matched single agent
  caught **16 at ~1/5 the cost**, and the draw-matched arm caught the **most** (16–17, but
  with the **worst** precision 0.35–0.44). So the recall gain is **lens taxonomy + draw
  count**, not parallel structure. The panel's one genuine structural win is **precision**
  (0.53–0.73 at equal agent count).
- **Decision.** Localized the value honestly: for everyday use, recommend the cheap
  prompt-matched single agent; reserve the panel for precision-at-scale. **T2 (productivity)
  stays unsupported even with headroom.**

## Experiment 3 — build the ULTRA pipeline (cost-no-object) · 2026-06-15

- **Question.** If cost is no object, what is the *quality ceiling* — and can it beat the
  precision/recall trade-off the controls exposed?
- **Method.** Stage A — wide cross-model generation: Claude Opus **7-lens panel + 3 deep
  draws** ∪ Gemini-2.5-pro (full + deep) = **417 candidate defects** across 6 tasks. Stage B
  — a single **GPT-5.2 adjudicator** per artifact deduped and dropped false positives →
  **32 confirmed** (~5–6/task). 78 generation+adjudication agents.
- **Result.** A clean confirmed list per artifact — wide generation for recall, strong
  adjudication for precision.
- **Decision.** Proceed to judging — but judge carefully (Experiment 5).

## Experiment 4 — single-judge scoring · 2026-06-15 · **showed why one judge isn't enough**

- **Method.** One GPT-5.2 judge scored the Stage-B confirmed list against the planted key.
- **Result.** **17/18** (recall 0.944) — it disputed one deep-reasoning (c) catch.
- **Decision.** A single judgment on a free-text→planted match is noisy. **Do not headline a
  single judge** — escalate to a panel.

## Experiment 5 — robust judge panel · 2026-06-15 · **the headline measurement**

- **Method.** A panel of **5 cross-model judges (4× GPT-5.2 + 1× Gemini-2.5-pro)**, blind to
  provenance, **majority vote per planted defect**.
- **Result.** **ULTRA V1 = 18/18 (1.000)** — a=1.0, b=1.0, **c=1.0** — precision **0.631**.
  The earlier 17/18 was single-judge variance; the panel majority confirms all 18, including
  every deep-reasoning defect.
- **Decision.** This is the reported headline. All recall figures in this whitepaper are
  panel-majority, never a single judge.

## Experiment 6 — "push harder" escalation · 2026-06-15 · **failed attempt, kept**

- **Question.** Can adding *more* generation (a GPT-5.2 deep-reasoning pass) push V1 past
  18/18 and lift precision?
- **Method.** ULTRA V2 = V1 + a GPT-5.2 deep-gen pass → **455 candidates**, re-adjudicated →
  **33 confirmed**, 84 agents. Same 5-judge panel.
- **Result.** **It got WORSE: 16/18 (c=0.667)**, precision 0.673. More candidates crowded the
  adjudicator's fixed output budget and pushed out two real deep-reasoning catches for a
  small precision gain.
- **Decision.** Recorded as a failed improvement. The recipe now says **"stop at one
  generation round."** Wider is not monotonically better once the adjudicator saturates.

## Experiment 7 — adversarial refute pass · 2026-06-15 · **explains the precision floor**

- **Question.** Are the ~37% "false positives" (vs the 3-per-task key) hallucinations, or
  real defects the key simply doesn't list?
- **Method.** Two independent cross-model refuters (GPT-5.2 + Gemini), **"both must refute to
  drop"** (conservative — protects recall). 64 refute calls on V1, 66 on V2.
- **Result.** **0 dropped** — V1 kept 32/32, V2 kept 33/33. Every confirmed defect survived
  two independent cross-model attempts to refute it.
- **Decision.** The non-planted findings behave like **real extra defects, not
  hallucinations** — so precision **0.63 is a floor set by an incomplete key**, not a
  measured hallucination rate.

## Experiment 8 — adversarial audit of the write-up · 2026-06-16

- **Question.** Do the documents overclaim or drift from the raw evidence?
- **Method.** A 4-lens audit workflow (numbers · overclaim/hype · consistency · evidence)
  read all 8 docs against the raw result files.
- **Result.** Consistency passed clean. One **major** caught — a hype phrase ("overwhelming
  quality … it demonstrated it") — plus six minor caveat-placement / number-backing issues
  (an unsupported precision figure, inconsistent rounding, missing inline scope tags).
- **Decision.** All eight fixed; re-verified that the hype was gone, numbers consistent, and
  links resolved. The audit is itself part of the evidence: the write-up was attacked before
  publication, and the attacks that landed were applied.

## Experiment 9 — re-run on the latest models · 2026-06-16 · **newest ≠ better, kept**

- **Question.** The published run used GPT-5.2 + Gemini-2.5-pro. With newer models now
  live (GPT-5.5, Gemini-3.1-pro-preview), does "latest" raise the ceiling?
- **Method.** Re-ran V1's pipeline: Opus candidates reused (Claude worker unchanged),
  **Gemini-3.1-pro-preview** generation, a **GPT-5.5** adjudicator, and a **4× GPT-5.5 / 1×
  Gemini-3.1-pro-preview** judge panel. 402 candidates → 24 confirmed.
- **Result.** **16/18 (0.889)** recall at precision **0.742** — the **highest precision of any
  run**, but two deep-reasoning (c) catches below the 18/18 peak. GPT-5.5 confirmed fewer
  (24 vs 32) and Gemini-3.1 generated fewer candidates (46 vs 61), so two c-defects (h4, h6)
  never reached the confirmed list.
- **Decision.** Recorded as-is: on this single n=6 run the newer models buy **precision, not
  recall**. The everyday config now pins the latest models (a newer model is preferred once it
  passes the eval gate — see [`../orchestration/MODELS.md`](../orchestration/MODELS.md)), but
  the whitepaper keeps each number labelled with the models that produced it. "Newest" is not
  assumed strictly better; it is measured — and here it wasn't, on recall.

---

## Experiment 10 — the delivery gate, powered to significance · 2026-06-22 · **the first significant result**

- **Question.** Experiments 1–9 measure a *defect-catch ceiling* on n=6. Does the deterministic
  delivery gate (`fable_check`) actually make a *handed-over deliverable* better — and can it be powered
  past anecdote to statistical significance?
- **Method.** A **60-task** templated battery (research / funnel / doc / marketing / code) generated in
  the Fable style. The gate fired on **31**. Each blocked draft was revised three ways — **C** raw
  draft, **T** revised under the gate's *specific* BLOCK flags, **P** revised under a *generic* "make it
  excellent" placebo — and judged blind, forced-choice, **both orders** (order-inconsistent = position
  bias = tie) by Gemini-2.5-pro. Scored with an **exact two-sided binomial sign test** + **Wilson 95%
  CIs**. An objective, judge-free check also recorded whether each revision *cleared the named gate gap*.
- **Result.** **T vs C: 27–0** (p≈1.5×10⁻⁸, CI [87.5,100]%). **T vs P: 16–9** (p=0.23, **n.s.**).
  **C vs P: 0–28.** Objective: T cleared the named gap on **80.6%** of blocked tasks, P on **12.9%**.
- **Decision.** Kept with the null in the headline: the gate **reliably beats shipping the raw draft**
  (significant) but shows **no quality-ceiling edge over a generic second pass** (not significant). The
  gate's demonstrated value is the **deterministic structural guarantee** — it names the specific missing
  acceptance criterion and gets it fixed five times as often as a generic pass — not a higher ceiling.
  That is exactly how the installed governor wires it (`profiles/full.md`: *"a structural floor, not a
  quality judge"*). Smaller earlier replications (pilot 7–0; cross-model agreement) are kept under
  `eval/comparison/fable-check-sim/out/`–`out3/`; the powered run is `out4/`. Note: 4 tasks hit a
  `claude` native-binary infra error producing empty drafts and were regenerated clean before scoring.

---

## What these experiments do NOT prove (carried, not hidden)

- They measure **defect-catch on a small (n=6), author-planted fixture with single-run
  generation** — robustly *judged*, not a **developer-productivity** number. T2 stays
  demoted.
- The ULTRA win is **"diverge-wide-then-adjudicate,"** *not* a vindication of parallel
  structure over a solo agent — Experiment 2's controls refute that.
- Precision is reported as a **floor** (Experiment 7), and cost is counted in **agents**, a
  proxy (the Workflow runtime exposes no token/wall-clock instrumentation).

Full caveats: [§6 Limitations](06-limitations.md). Reproduce any line above:
[§7 Reproduce](07-reproduce.md).

---

## Why this log raises trust (and why it isn't spin)

A reviewer — human or AI — can see the full arc: a hypothesis that **failed twice**
(Experiments 1, 2), a best-case result that was **deliberately not over-read** (Experiments
4–5), a "make it better" attempt that **backfired and was kept in the record** (Experiment
6), and a write-up that was **attacked and corrected before shipping** (Experiment 8). That
shape — negative results retained, claims bounded to what was measured, course-corrections
documented — is what distinguishes a measured tool from a marketed one. The recommendation
this earns is not "trust it"; it is **"check it, then decide"** — and the checks are all
here.
