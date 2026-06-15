# A/B Result — 2026-06-15 (harder fixture)

Follow-up to `results-2026-06-15.md`. The first run was on a saturated fixture (single
agents caught everything). This run uses **`fixtures/seeded-defects-hard.json`** — 6
denser artifacts (pagination tie-skip, JWT alg-confusion, float money, path-escape/TOCTOU,
forEach-async, SQL identifier injection) with **18 subtle planted defects** (a/b/c) chosen
to sit *below* the single-agent ceiling and **not** engineered to favor decomposition.

Same setup: workers **Opus + Sonnet** (Workflow), independent **GPT-5.2** judge (OpenAI
direct), blind to arm. 156 worker agents, 52 judge calls, 0 errors. **Still n=6 verify
tasks — directional, not statistically significant.**

## True positives caught (out of 18 planted) + cost

| worker | arm | a | b | c | TP/18 | precision | agents | caught/agent |
|---|---|---|---|---|---|---|---|---|
| opus | A single | 1.0 | .83 | .50 | **14** | .46 | 6 | **2.33** |
| opus | A2 prompt-matched | 1.0 | 1.0 | .67 | **16** | .42 | 6 | **2.67** |
| opus | A_N draw-matched | 1.0 | 1.0 | .67 | **16** | .35 | 30 | 0.53 |
| opus | **B panel** | 1.0 | 1.0 | .50 | **15** | .53 | 30 | 0.50 |
| sonnet | A single | .83 | 1.0 | .33 | **13** | .59 | 6 | **2.17** |
| sonnet | A2 prompt-matched | 1.0 | .83 | .33 | **13** | .52 | 6 | **2.17** |
| sonnet | A_N draw-matched | 1.0 | 1.0 | .83 | **17** | .44 | 30 | 0.57 |
| sonnet | **B panel** | 1.0 | .83 | .67 | **15** | .73 | 30 | 0.50 |

Divergent (8 reference approaches): opus single 1.0 / panel 0.75; sonnet single 0.875 /
panel 1.0 — a wash.

## What the controls reveal (this is the whole point of the run)

There is now real **headroom** — single agents miss ~20–30% of defects, concentrated in
stratum **c (deep-reasoning)**: Opus single c=0.50, Sonnet single c=0.33. So the arms can
finally be discriminated. And they are:

1. **The panel beats the single *baseline* on recall — slightly.** Opus 15 vs 14, Sonnet
   15 vs 13. A faint real signal that more independent review helps on hard tasks.
2. **But the panel does NOT beat its own controls** — which means the recall gain is the
   **confound, not the structure**:
   - **Prompt-matched (A2): one agent handed the full lens menu in one context** caught
     **16** on Opus (> the panel's 15) and tied the single on Sonnet — at **1/5 the agent
     cost** of the panel. The lens *taxonomy*, not the parallelism, carries the recall.
   - **Draw-matched (A_N): 30 generic unstructured draws** caught the **most** raw true
     positives (Opus 16, Sonnet 17) — more than the panel — confirming that extra *draw
     count* (ML-4), not independence, drives the rest. (At an awful precision; see below.)
3. **The panel's one genuine structural win is PRECISION, not recall.** At the *same* 30
   agents, the structured panel is far cleaner than raw draws: precision 0.53 vs 0.35
   (Opus) and 0.73 vs 0.44 (Sonnet). Lens focus suppresses false positives that naive
   repeated sampling sprays.
4. **Cost: the panel remains a ~4–5× regression per defect** (caught/agent ≈ 0.5 vs ≈ 2.2–2.7
   for the single and prompt-matched arms), **persisting across the Opus→Sonnet swap**
   (structural/model-invariant).
5. **Deep-reasoning (c) is helped by more *attempts*, not by structure:** A_N (more draws)
   scored best on c (Opus .67, Sonnet .83), the panel inconsistently (Opus .50, Sonnet .67).
   Consistent with "c is weights-bound; sampling helps by buying more shots, not by lensing."

## Verdict for T2 ("productivity demonstrably improves")

**Still NOT supported — and now we know *why* the naive recall gain is illusory.** The
panel's edge over a single pass is explained by the lens *menu* + raw *draw count* (its own
controls match or beat it), not by the parallel-independent structure the recipe is sold on.
The structure's real, defensible value is **precision at scale** (cleaner than raw draws) and
a modest deep-reasoning hedge via more sampling — **neither of which justifies 5× the agents
for most uses.**

**Actionable, evidence-backed recommendation (the useful finding):** the cheapest effective
configuration is the **prompt-matched single agent (A2)** — one strong agent given the full
lens checklist in one context. It matched or beat the panel's recall at **1/5 the cost** on
this fixture. Reserve the parallel panel for the cases where **precision at high agent count**
genuinely matters (e.g. you will already spend many agents and want to suppress false
positives), not as a default "catches more" tool.

## Caveats (binding)

- **n=6 verify tasks — not statistically significant.** Direction only; a powered run needs
  many more tasks (see README power note).
- **Author-planted defects** (single author): partial circularity risk, mitigated by choosing
  subtle real-bug-class defects and *not* engineering them for the panel — but
  independently-sourced defects (real CVE/bug-fix commits) would harden this further.
- **Single judge (GPT-5.2).** A dual-judge (e.g. + Gemini) agreement check would tighten the
  borderline "caught?" calls.
- This **falsifies the strong recipe claim** and **localizes the real value (precision, not
  recall; and the cheap A2 captures most of the recall)** — exactly what an honest eval is for.
