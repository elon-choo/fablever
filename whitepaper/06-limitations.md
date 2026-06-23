# 6 · Limitations & threats to validity

This page is deliberately the longest-lived part of the whitepaper. The project's public
posture is *not* "criticism-proof" — it is "every criticism a reasonable reviewer raises
is already conceded here, in writing, or rebuttable at source." If you find a gap not
listed here, that is a publication blocker until it is conceded, fixed, or rebutted — open
an issue.

---

## 6.1 The load-bearing one: this is defect-catch, not productivity

The headline result — ULTRA catching **16/18** planted defects on the latest models (and a
**18/18** peak on the prior models) — is a **recall number on a planted-defect fixture.** It
is **not** a developer-productivity number, and nothing in this folder claims it is.

- The project's standing rule **B4** forbids any productivity-magnitude claim before a
  pre-registered, developer-facing A/B is run. ULTRA does not satisfy that bar and does
  not pretend to.
- "Catches more planted bugs in a benchmark" and "makes an engineer ship faster" are
  different claims with different evidence requirements. We have evidence for the first,
  on a small fixture. We make **no** claim about the second.
- The aspirational thesis **T2 ("productivity demonstrably improves") stays demoted** to
  *a hypothesis with mechanism support; magnitude unmeasured and falsifiable.*

## 6.2 Fixture: small, author-planted, single-run generation

- **n = 6** artifacts, **18** planted defects. Small. Margins are noisy.
- The defects are **author-planted** and stratum-labelled. Real-world defect distributions
  differ. An independently-sourced fixture is a known want (EVAL-5).
- The **judging** is panel-robust (5 cross-model judges, majority vote). The **generation**
  that produced each confirmed list is a **single pipeline run.** So "18/18" is one
  execution's recall, robustly *graded* — not a distribution over many generation runs.
  Directional, not definitive.

## 6.3 Precision (≈ 0.63) is understated by the key — read it as a floor

Against the 3-planted-per-task answer key, ULTRA V1's precision is ≈ 0.63 (≈ 12 "false
positives" across 32 confirmed). But:

- The artifacts are **real buggy code** that plausibly contains defects **beyond** the 3
  planted per task. A confirmed defect that doesn't match a planted one is scored a "false
  positive" even if it is a genuine bug.
- **Direct evidence it is genuine, not hallucinated:** an adversarial **refute pass** — two
  independent cross-model refuters (GPT-5.2 + Gemini), "both must refute to drop" — dropped
  essentially **nothing** from the confirmed list. The non-planted findings survive
  independent cross-model attempts to refute them, which is what you'd expect of *real*
  extra defects and *not* of hallucinations.
- So 0.63 is a **floor** set by an incomplete key, not a measured hallucination rate.

## 6.4 The win is "diverge-then-adjudicate," NOT "parallel structure"

It would be easy to over-read 18/18 as "the parallel panel is what wins." The controlled
A/B says otherwise, and we hold to it:

- On the hard fixture the **panel did not beat its own controls** — a prompt-matched
  single agent (A2) and a draw-matched arm (A_N) matched or exceeded its recall, localizing
  the recall gain to **lens taxonomy + draw count**, not parallel structure.
- ULTRA wins by being **wide cross-model generation → strong adjudication**, which is a
  *recall×precision frontier* move, not a vindication of "N parallel agents beat one." We
  say the narrower, defensible thing.

## 6.5 Cost is real and large

ULTRA V1 spends ≈ 13 generation+adjudication agents/API-calls **per artifact**, plus a
5-judge panel for *measurement*. This is a **high-stakes, cost-no-object** configuration —
appropriate for a security-critical review, a release gate, a spec sign-off; **not** an
everyday loop. The repo's everyday recommendation remains the cheap prompt-matched single
agent (A2), which captured most of the recall at ~1/5 the cost. Token/wall-clock
cost-direction is **not** instrumented (the Workflow runtime exposes no `Date.now`/usage —
COST-3/COST-6); cost here is counted in agents, a proxy.

## 6.6 Cross-model judging leaks (minor, here)

The same model family (GPT-5.2) appears in generation-adjudication and in the judge panel.
For **ground-truth scoring** the judge matches submissions to a known answer key, so the
leak is minor — but it exists. Mitigations: the judge panel is **cross-model** (Gemini
included) and **blind to provenance**; and in the shipped product, cross-model verdicts
**never** touch the runtime RED gate (claim C3). A fully leak-free judge would be a model
in neither the generation nor the adjudication set; that is a refinement, not a correction.

## 6.7 Still-open items (carried from the consensus, not closed by ULTRA)

- **D2 — provenance snapshot.** The profile's "distilled from official Anthropic guidance"
  claim still rests on live URLs + a local cache, not an archived public snapshot. Launch
  blocker for that specific claim.
- **Token/wall-clock cost-direction.** Needs call-site instrumentation the Workflow runtime
  cannot provide. Open.
- **Developer-facing productivity A/B.** **Run** (`../eval/comparison/productivity-ab/`) — one-shot
  forced-choice (n=30) and multi-turn turns-to-done (n=18), both found **no productivity gain** (a
  published null/negative). It **bounds** T2 rather than grounding it: the proxies are LLM judge + LLM
  oracle, which carry a completeness-bias that under-credits decisive brevity, and neither simulates a
  long interactive coding session — so this *measures-and-does-not-find*, it does not refute.

---

**The honest one-paragraph version.** On a small, author-planted fixture, a cost-no-object
cross-model "diverge-wide-then-adjudicate" pipeline caught every planted defect under a
robust multi-judge panel, where cheaper single-agent and same-family configs did not — a
genuine *defect-catch* result on the *recall×precision frontier*. It is **not** a
productivity claim, **not** a vindication of parallel structure over a solo agent, and
**not** free. Read it as: *when correctness matters more than cost, diverge as wide as you
can across models and then adjudicate hard — that ceiling is real and measurable.*
