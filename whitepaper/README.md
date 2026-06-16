# fablever — Whitepaper

A complete, current (2026-06-15) writeup of the **fablever / fable-profile** system and the
evidence behind every claim it makes — written to be published to the open-source community
and to survive adversarial review. It supersedes the older notes in
[`../docs/`](../docs/) (kept for history); everything here reflects the latest measured
state, including the cost-no-object **ULTRA** cross-model result.

---

## 60-second summary

**What it is.** An always-on **Fable working-style** output style for any Claude model in
Claude Code, plus an experimental **orchestration** layer and an off-by-default
**cross-model verification** arm. Zero npm dependencies. It is a **style** transplant, not
a capability one — it changes *how* a model works, not its reasoning ceiling.

**What the evidence shows (on a small, planted, n=6 fixture, robustly judged):**

- A controlled 4-arm A/B says a parallel panel **does not beat its own controls** on recall
  — the recall gain is lens taxonomy + draw count, not parallel structure; the panel's real
  win is **precision**. On easy/saturated tasks the panel is **pure cost** (~5× regression).
- When **cost is no object**, a cross-model **"diverge-wide-then-adjudicate"** pipeline (ULTRA)
  on the **latest models (GPT-5.5 + Gemini-3.1-pro-preview)** caught **16/18** planted defects
  at the **highest precision of any config (0.74)** under a **5-judge cross-model panel**. The
  prior-model run (GPT-5.2 + Gemini-2.5-pro) peaked at **18/18** recall at precision 0.63 — the
  newer models traded ~2 deep-reasoning catches for precision. *(n=6 author-planted, single
  generation run; a defect-catch result, not productivity.)*
- Pushing *harder* (a second generation escalation) **lowered** recall to 16/18 — recorded
  as a failed attempt. **Simpler won.**

**What it does NOT claim.** No developer-productivity magnitude (that needs a different,
unrun A/B). Not "parallel structure beats a solo agent" (the controls refute it). Nothing
beyond a small author-planted fixture. The result is a **defect-catch** ceiling, not a
productivity number — and that distinction is the entire discipline.

---

## Read in order

| # | Page | What it covers |
|---|------|----------------|
| 1 | [What this is (and isn't)](01-what-this-is.md) | the three subsystems; style-not-capability; the binding honest posture |
| 2 | [Methodology](02-methodology.md) | the 4-arm A/B; the ULTRA pipeline; why a judge *panel*; threats carried openly |
| 3 | [Results](03-results.md) | every measured number: A/B controls + the ULTRA frontier (latest 16/18 @ 0.74; prior peak 18/18) |
| 4 | [Max-quality configuration](04-max-quality-config.md) | the cost-no-object recipe — and the "stop at one generation round" guard |
| 5 | [Consensus & claims ledger](05-consensus-and-claims.md) | the full claims table + multi-model/persona verdict + the ULTRA round |
| 6 | [Limitations & threats to validity](06-limitations.md) | the longest-lived page; every conceded gap |
| 7 | [Reproduce](07-reproduce.md) | run every number yourself |
| 8 | [Experiment log](08-experiment-log.md) | the dated lab notebook — every run, including the failed and negative ones |
| 9 | [Running it](09-running-it.md) | keys, API-key vs account login, and the auto / on / off cost dial + latest-model mechanism |

---

## The one-line honest headline

> When correctness matters more than cost, **diverge as wide as you can across models and
> then adjudicate hard** — that defect-catch ceiling is real and measurable (latest models:
> 16/18 at 0.74 precision; prior-model peak: 18/18 recall), and leads every cheaper config on
> the precision-at-recall frontier. It is *not* a productivity claim, *not* a win for parallel
> structure over a solo agent, and *not* free.

*Provenance: the latest run (2026-06-16) used Claude Opus + Gemini-3.1-pro-preview workers and
GPT-5.5 as adjudicator/judge; the prior peak run used Gemini-2.5-pro + GPT-5.2; full commands in [§7](07-reproduce.md). Not
affiliated with Anthropic; see [`../NOTICE`](../NOTICE).*
