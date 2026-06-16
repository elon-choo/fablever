# 2 · Methodology — how every number in this folder was produced

Nothing here rests on intuition. Each claim about orchestration value comes from an
**executed measurement against a planted ground-truth fixture**, judged by models that
are different from the workers and (for the headline) by a **panel** rather than a single
grader. This page documents the measurement machinery so a skeptic can reproduce or
attack it. The honest limits are stated inline, not deferred to a footnote.

---

## 2.1 The question, stated so it can be falsified

The aspirational thesis is *"orchestration makes a worker model find more / better
defects."* That sentence hides four different things that could each be the real cause of
any gain:

1. **Parallel structure** — N independent agents running concurrently vs one agent.
2. **Lens taxonomy** — the per-skeptic prompts ("look for races", "look for auth bugs")
   that decompose the search, independent of *how many* agents run.
3. **Draw count** — N sampled completions simply catch more than 1, by variance alone.
4. **Cross-model weights** — a genuinely different model (GPT, Gemini) sees a class of
   defect a same-family panel structurally cannot.

A measurement that does not separate these will credit "parallel structure" for a gain
that was really draw count. So the design **ablates them apart**.

---

## 2.2 The controlled A/B (isolates structure from its confounds)

Worker model is held **fixed**; only the orchestration **structure** changes across four
arms run on the same fixture:

| Arm | What runs | Isolates |
|-----|-----------|----------|
| **A** — baseline | one mega-agent, one context | the floor |
| **A2** — prompt-matched | one agent, **all** lenses, one context | the lens **taxonomy** (no extra agents) |
| **A_N** — draw-matched | N generic draws, union of findings | the **draw count** (no lens decomposition) |
| **B** — panel | N independent lens skeptics (parallel) | the **parallel structure** |

- **Metric:** `caught_per_agent` — defects caught normalized by agent count. The Workflow
  runtime exposes neither `Date.now` nor token usage, so this is an **agent-count cost
  proxy**, not a token/wall-clock cost. Apples-to-apples only between agent-count-matched
  arms. (This limit is tracked as COST-3/COST-6 and is not hidden.)
- **Placebo discriminator:** swap the worker Opus→Sonnet. A *structural* gain persists
  across the swap; a *placebo* (an artifact of one model's quirks) vanishes.
- **Ground truth:** a fixture of artifacts with **planted** defects, each labelled by
  stratum — **a** = contradiction/contract violation, **b** = omission, **c** =
  deep-reasoning (subtle, looks-fine-on-the-surface). Recall is measured per stratum.

This is the arm set in `eval/ab-harness.mjs`. Its purpose is **falsification** — it is
built to be able to say "the panel is pure cost," and on the saturated seed fixture it
**did** say exactly that.

---

## 2.3 The ULTRA pipeline (the cost-no-object configuration)

The A/B above asks "does structure beat a solo agent at equal-ish cost?" A different
question is *"if cost is no object, what is the best achievable quality?"* That is the
**ULTRA** pipeline. It deliberately spends — the point is the ceiling, not the budget.

```
Stage A — WIDE divergent generation (maximize recall)
  • Claude Opus  : 7-lens adversarial panel + 3 deep-reasoning draws   (via the Workflow tool)
  • Gemini-2.5-pro : full review pass + deep-reasoning pass             (direct Google API)
  →  union of all candidate defects  (≈ 70 per artifact, noisy, duplicated)

Stage B — adversarial ADJUDICATION (recover precision)
  • one GPT-5.2 final adjudicator per artifact
  • dedupe near-duplicates, DROP false positives / speculation / style nits
  →  a clean confirmed list  (≈ 5–6 per artifact)

Stage C — adversarial REFUTE  (optional precision tightening)
  • two independent cross-model refuters (GPT-5.2 + Gemini), "both must refute to drop"
  • conservative by design: protects recall, trims only defects neither refuter can defend

Stage D — robust JUDGE PANEL  (measurement, not generation)
  • 5 cross-model judges (4× GPT-5.2 + 1× Gemini-2.5-pro), BLIND to how defects were produced
  • MAJORITY vote per planted defect decides "caught"
  →  per-stratum recall + precision, with single-judge variance removed
```

The shape is the whole point: **diverge as wide as possible, then adjudicate hard.**
Wide cross-model generation maximizes *recall*; a strong independent adjudicator recovers
*precision* from the resulting noise. Neither half alone gets both.

### Why a judge *panel*, not a single grader

Matching a free-text defect to a planted one is a judgment call, and a single judge has
run-to-run variance: on the prior-model peak run one strict single-judge pass scored 17/18
(it disputed one deep-reasoning catch) while the **5-judge majority scored 18/18**. Headlining
the single run — in either direction — would be exactly the methodological sloppiness this
project exists to avoid. Every headline number in [§3 Results](03-results.md) is panel-majority
(the latest-model run is panel-scored at 16/18), never a single judge.

---

## 2.4 What the design cannot tell you (threats carried openly)

- **It measures defect-catch, not developer productivity.** A planted-fixture recall
  number is *not* a productivity-magnitude number. The project's standing rule (B4)
  forbids a productivity claim before a developer-facing, pre-registered A/B runs. ULTRA
  does not change that. See [§6 Limitations](06-limitations.md).
- **Generation is a single pipeline run.** The *judging* is panel-robust; the *generation*
  that produced each confirmed list is one execution on an **n=6, author-planted** fixture.
  Directional, not definitive.
- **Precision is understated by the key.** Only 3 defects are planted per artifact, but
  the artifacts are real buggy code that plausibly contains *more* real defects — so some
  "false positives" are likely genuine extra findings, not hallucinations. Reported
  precision is therefore a **floor**.
- **Cross-model judging can leak.** For ground-truth scoring the judge is matching to a
  known answer key, so the leak is minor — but it is a leak, and it is why cross-model
  verdicts never touch the runtime RED gate in the shipped product (claim C3).

Full reproduction commands are in [§7 Reproduce](07-reproduce.md).
