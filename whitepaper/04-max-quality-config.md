# 4 · The max-quality configuration (cost-no-object)

This is the recipe behind the [§3](03-results.md) headline — the configuration to reach
when **correctness matters more than cost**: a security-critical review, a release gate, a
spec sign-off, an irreversible migration. It is deliberately expensive. For everyday work,
use the cheap prompt-matched single agent instead (see [§4.4](#44-when-not-to-use-this)).

The measured configuration on the **latest models (GPT-5.5 + Gemini-3.1-pro-preview)** caught
**16/18** planted defects at the **highest precision of any config (0.74)** under a robust
5-judge panel; the prior-model run (GPT-5.2 + Gemini-2.5-pro) peaked at **18/18** recall at
0.63 precision — newer models traded ~2 deep-reasoning catches for precision *(n=6
author-planted, single generation run; a defect-catch result, not productivity — see
[§6.1](06-limitations.md))*. Critically, the prior run also showed **V1 beat the "bigger" V2**:
adding more generation hurt. The recipe below is that pipeline, and the "do not over-build it"
note is load-bearing.

---

## 4.1 The recipe

```
GOAL: maximize defect recall without drowning in false positives, cost no object.

1 · DIVERGE AS WIDE AS POSSIBLE  (this is where recall comes from)
    • a same-family lens panel: one skeptic per failure-mode lens
      (correctness · contract · concurrency/TOCTOU · auth · numeric/precision ·
       parser/identifier · resource), each in its own fresh context
    • a few deep-reasoning draws: same model, "hunt only the subtle, non-obvious flaw"
    • AT LEAST ONE genuinely different-weights model (GPT and/or Gemini) running the
      same wide pass — it catches a class the same family structurally cannot
    → union everything. Expect it to be noisy and duplicated. That is correct.

2 · ADJUDICATE HARD WITH ONE STRONG INDEPENDENT MODEL  (this is where precision comes from)
    • a single top reasoner (here GPT-5.2), given the artifact + the full candidate union
    • job: dedupe, merge near-duplicates, DROP false positives / speculation / style nits
    • keep the subtle real ones
    → a clean confirmed list (~5–6 per artifact)

3 · (OPTIONAL) REFUTE TO TIGHTEN PRECISION
    • two independent cross-model refuters, "both must refute to drop" (conservative —
      protects recall). In our run it dropped ~nothing, confirming the list was robust.

4 · DO NOT ADD A SECOND GENERATION ESCALATION
    • measured: adding a GPT-5.2 deep-generation pass on top (V2) LOWERED recall 18→16.
      More candidates crowd the adjudicator's output budget and push out real catches.
      Wider generation has diminishing — then negative — returns once the adjudicator
      saturates. Stop at step 2.
```

The single sentence: **diverge wide across models, then adjudicate hard — and stop there.**

---

## 4.2 Why each piece is load-bearing (from the evidence, not taste)

- **Cross-model generation, not just a bigger same-family panel.** The controlled A/B
  showed a same-family panel does not beat its own controls on recall. The extra recall
  in ULTRA comes from *draw count + lens taxonomy + different weights*, and the
  different-weights model is the part a same-family setup structurally cannot replace
  (claim C1).
- **A single strong adjudicator, not a vote.** Precision is recovered by one capable model
  reading the artifact against the whole noisy union and cutting hard. This is the step
  that turns "draws caught the most but with the worst precision" into "caught the most
  *and* clean."
- **Stop at one generation round.** V2 is the evidence: more is worse once the adjudicator
  is the bottleneck.
- **Judge with a panel, report the majority.** Single-judge variance is real (17 vs 18 on
  the same list). For *grading*, not generating, use ≥3 cross-model judges and majority
  vote. (In production you don't grade against a key — but the lesson stands: a single
  model's verdict is noisy; decorrelate it.)

---

## 4.3 How this maps to the shipped repo

The shape above is exactly the orchestration layer's **`adversarial-verify` + cross-model
(`xverify`)** recipes composed: the wide same-family panel and deep draws are the Workflow
recipes; the different-weights model is subsystem **C** (off by default,
`fusion-server.js`); the adjudication/refute steps are a strong-model pass over the union.
The cross-model arm stays **off by default** and **never touches the runtime RED gate**
(claim C3) — in this whitepaper it is used for *measurement against a key*, which is a
different setting from a live gate.

What the repo does **not** yet ship is a one-command "ULTRA" wrapper that chains all four
stages with external keys; the [§7 reproduce](07-reproduce.md) scripts are the current
path. Packaging that wrapper (with the "stop at one generation round" guard baked in) is
the natural next deliverable.

---

## 4.4 When NOT to use this

- **Everyday review / a quick check.** Use the **prompt-matched single agent** (A2): one
  agent, the full lens menu, one context. It captured most of the recall at ~1/5 the cost
  ([§3.2](03-results.md)). ULTRA's ~13 agents/artifact + a judge panel is overkill here.
- **Easy or saturated tasks.** If a single strong pass already catches everything, every
  extra agent is pure cost (the seed-fixture result). Spend the budget only where there is
  headroom a solo pass misses.
- **When you need a token/wall-clock cost guarantee.** Not instrumented yet
  ([§6.5](06-limitations.md)); ULTRA is justified by *stakes*, not by a measured ROI.
