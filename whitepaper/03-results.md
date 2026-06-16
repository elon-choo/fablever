# 3 · Results — the measured numbers

All recall figures are **panel-majority** (5 cross-model judges, majority vote per planted
defect), against the hard fixture (`eval/fixtures/seeded-defects-hard.json`: 6 artifacts,
18 planted defects, stratified **a** contradiction / **b** omission / **c** deep-reasoning).
Methodology and its limits: [§2](02-methodology.md) and [§6](06-limitations.md).

> **What "recall" and "precision" mean.** *Recall* = of the defects that are actually there,
> what fraction did we catch (did we miss any)? 16 of 18 planted = 16/18 ≈ 0.89. *Precision* =
> of the defects we reported, what fraction are real (any false alarms)? They **trade off** —
> catching more tends to add false alarms (↑recall, ↓precision); filtering harder tends to miss
> some (↑precision, ↓recall) — so both are always reported. (Precision here is a **floor**: the
> answer key lists only 3 defects per task, so genuine extra findings count against it — §3.3.)

---

## 3.1 Headline

> **A cost-no-object, cross-model "diverge-wide-then-adjudicate" pipeline (ULTRA) caught
> 18/18 planted defects — a=1.0, b=1.0, c=1.0 — under a robust 5-judge cross-model panel
> (4 GPT + 1 Gemini, majority vote per planted defect), at precision ≈ 0.63. No cheaper
> single-agent config and no same-family panel reached that; every one of them missed
> deep-reasoning (c) defects that ULTRA caught.**

That peak recall used **GPT-5.2 + Gemini-2.5-pro**. A 2026-06-16 re-run on the **latest
models (GPT-5.5 + Gemini-3.1-pro-preview)** scored **16/18 at precision 0.74** — the newer
models traded ~2 deep-reasoning catches for higher precision, *not* more recall (§3.3). Each
number in this whitepaper is labelled with the models that produced it; relabeling without
re-running would be fabrication.

This is a **defect-catch** result on a small fixture, not a productivity claim. Read it
with [§6.1](06-limitations.md).

---

## 3.2 The controlled A/B (what structure is, and isn't, worth)

Two prior runs, both in the repo (`eval/results-2026-06-15.md`, `…-hard.md`):

**Seed fixture (n=2) — saturated.** A single strong agent already caught ~everything, so
the parallel panel was **pure cost**: `caught_per_agent` ≈ 0.6 (panel) vs ≈ 3.0 (single) —
a ~5× cost regression that **persisted across the Opus→Sonnet swap** (so: structural, not
a one-model placebo). On easy tasks, orchestration is a tax.

**Hard fixture (n=6) — real headroom, and the controls spoke:**

| Arm | Recall /18 | Precision | Cost (agents) |
|-----|:---:|:---:|:---:|
| A — single baseline (Opus / Sonnet) | 14 / 13 | ~0.46 (Opus) | 1 |
| A2 — prompt-matched (all lenses, 1 agent) | **16** (Opus) | ~0.42 | 1 |
| A_N — draw-matched (N draws, union) | 16–17 | **0.35–0.44** (worst) | N |
| B — panel (N parallel lens skeptics) | 15 | 0.53 / 0.73 | N |

The decisive finding: **the panel does not beat its own controls.** A2 (one agent, all
lenses, **1/5 the cost**) matched or beat the panel's recall; A_N caught the most but with
the worst precision. So the recall gain is the **lens taxonomy + draw count** (confounds
ML-1 / ML-4), **not** the parallel structure. The panel's one genuine structural win is
**precision** (cleaner output at equal agent count) — not more catches. Cost stays ~5×.

**Takeaway:** for everyday use, the cheap **prompt-matched single agent** captures most of
the recall. Reserve heavier orchestration for when you need precision-at-scale — or, when
cost truly doesn't matter, the ULTRA frontier below.

---

## 3.3 ULTRA — the cost-no-object frontier

Pipeline (full detail in [§2.3](02-methodology.md)): Claude Opus 7-lens panel + 3 deep
draws **∪** Gemini-2.5-pro (full + deep) → **one GPT-5.2 adjudicator** per artifact →
**5-judge cross-model panel (4 GPT + 1 Gemini)** scores vs planted.

| Config | Recall /18 | a | b | c (deep) | Precision | Gen+adj agents | Candidates |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **V1 — wide-gen → single adjudication** (GPT-5.2 + Gemini-2.5-pro) | **18 (1.000)** | 1.0 | 1.0 | **1.0** | 0.63 | 78 | 417 |
| V2 — V1 + GPT-5.2 deep-gen escalation | 16 (0.889) | 1.0 | 1.0 | 0.667 | 0.67 | 84 | 455 |
| V3 — **latest models** (GPT-5.5 + Gemini-3.1-pro-preview) | 16 (0.889) | 1.0 | 1.0 | 0.667 | **0.74** | 78 | 402 |

Three results, all adversarial:

1. **V1 leads the frontier (on this fixture).** 18/18 recall **and** precision 0.63 — a
   *floor* set by the 3-per-task key, cleaner than the raw draw arm (0.35–0.44) and
   comparable to the panel (the refute pass below shows why 0.63 is a floor, not a quality
   ceiling). It is the only config to score well on *both* axes at once. Every cheaper config missed
   at least one deep-reasoning (c) defect; V1 missed none. On this **n=6, author-planted,
   single-generation-run** fixture, that is the best measured defect-catch result here — a
   bounded result, not a general performance or productivity claim ([§6.1](06-limitations.md)).

2. **Pushing harder made it worse.** Adding a GPT-5.2 deep-reasoning *generation*
   escalation (V2) — more models, more candidates (455 vs 417) — **dropped recall to
   16/18.** More generation crowded the adjudicator's fixed output budget and pushed out
   two real deep-reasoning catches, buying only a small precision gain. **Simpler won.**
   This is recorded, not hidden: the escalation was a genuine attempt to reach 18/18 + higher
   precision, and the rigorous panel showed it backfired.

3. **Newest models ≠ higher recall (re-run 2026-06-16).** V1's pipeline re-run with the
   latest models — **GPT-5.5** adjudicator + a **4× GPT-5.5 / 1× Gemini-3.1-pro-preview**
   judge panel, with Gemini-3.1-pro-preview generation — scored **16/18 (0.889)** at the
   **highest precision of any run, 0.742**. The newer models *traded* ~2 deep-reasoning (c)
   catches for cleaner output: GPT-5.5 adjudicated more selectively (24 confirmed vs 32) and
   Gemini-3.1 surfaced fewer candidates (46 vs 61), so two c-defects (in h4, h6) never reached
   the confirmed list. On this single n=6 run, "latest" buys **precision, not recall** — a
   measured result, not an assumption that a newer model is strictly better. The peak recall
   (18/18) was produced with GPT-5.2 + Gemini-2.5-pro; both are honest single-run results, and
   the project's everyday config now pins the latest models ([`orchestration/MODELS.md`](../orchestration/MODELS.md))
   while this whitepaper keeps each number labelled with the models that produced it.

### Single-judge variance — why the panel matters

The same V1 confirmed list scored **17/18** under one strict single GPT-5.2 judge (it
disputed one c-defect) and **18/18** under the 5-judge majority. The difference is judge
variance, not generation. Reporting the single run — high or low — would be the exact
methodological error this project exists to flag. **All numbers above are panel-majority.**

### Adversarial refute — the "false positives" are real defects

An adversarial refute pass (two independent cross-model refuters, GPT-5.2 + Gemini,
*both must refute to drop*) removed essentially **nothing** from V1's confirmed list. The
non-planted "false positives" survive independent cross-model refutation — i.e. they behave
like **genuine extra defects**, not hallucinations. So the precision floor of 0.63 is set
by an **incomplete 3-per-task answer key**, not by a measured hallucination rate. See
[§6.3](06-limitations.md).

---

## 3.4 What this does and does not establish

**Establishes (on this fixture, robustly judged):** when cost is no object, *diverge wide
across models, then adjudicate hard* reaches a defect-catch ceiling — including
deep-reasoning defects — that single-agent and same-family-panel configs do not, while
keeping output clean.

**Does not establish:** any developer-productivity magnitude (T2 stays demoted); any claim
that parallel structure per se beats a solo agent (the controls refute that); anything
beyond n=6 author-planted artifacts with single-run generation. Full caveats:
[§6](06-limitations.md).
