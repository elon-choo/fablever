# 7 · Reproduce — re-run every number yourself

The headline defect-catch numbers ship with their **scripts and raw data** in
[`../eval/ultra/`](../eval/ultra/). The deterministic counts are checkable **offline, with no API
keys**; the live judge panel is re-runnable with your own keys. No result here asks you to trust a
screenshot.

> **Reproducibility tiers (be honest about which is which):**
> - **Tier 1 — offline, no keys.** `node eval/ultra/score.mjs` recomputes the candidate/confirmed
>   counts from committed raw JSON; `npm test` and the leaktest run locally. Anyone can check these
>   in seconds.
> - **Tier 2 — live, your keys.** The cross-model generation, adjudication, and the 5-judge panel
>   call external APIs. The scripts and their committed inputs are in `eval/ultra/`; re-running them
>   reproduces the numbers up to live-model variance (which the 5-judge panel exists to damp).
> - **The Claude-only A/B harness** (`eval/ab-harness.mjs`) is a **Workflow-tool module**, not a
>   bare-`node` script — see §7.1.

---

## 7.0 Fastest check (offline, zero keys)

```bash
node eval/ultra/score.mjs
```

Recomputes, straight from [`eval/ultra/raw/`](../eval/ultra/raw/), the candidate-union sizes
(`402` latest / `417` prior peak / `455` escalation) and confirmed-defect counts (`24` / `32` /
`33`) cited in [§3](03-results.md) and the [experiment log](08-experiment-log.md), and asserts they
cover the fixture's 6 artifacts / 18 planted defects. The full bundle (scripts, raw data, pipeline
walk-through) is documented in [`../eval/ultra/README.md`](../eval/ultra/README.md).

---

## 7.1 The controlled A/B (in-repo, Claude-only)

The 4-arm harness lives at `eval/ab-harness.mjs`. It is a **Claude Code Workflow-tool module** —
it uses the runtime globals `agent()` / `parallel()` / `log()` and a top-level `return`, so it runs
**through the Workflow tool inside Claude Code, not via bare `node`** (running `node
eval/ab-harness.mjs` will throw `Illegal return statement` — that is expected; it is not a CLI).
Its recorded output is committed at [`../eval/results-2026-06-15.md`](../eval/results-2026-06-15.md)
and [`../eval/results-2026-06-15-hard.md`](../eval/results-2026-06-15-hard.md).

It runs arms **A / A2 / A_N / B** on each artifact, swaps the worker Opus→Sonnet as the placebo
control, and reports per-stratum recall plus `caught_per_agent`. The fixtures:

- `eval/fixtures/seeded-defects.json` — the seed (n=2). **Saturated** — a single strong agent
  already catches everything, so the panel shows as pure cost. Kept as the ceiling-effect demo.
- `eval/fixtures/seeded-defects-hard.json` — the hard fixture (n=6, 18 planted defects, stratified
  a/b/c). This is the one with real headroom.

See `eval/README.md` for the pre-registered decision rule and its honest caveats (n is small;
`caught_per_agent` is an agent-count cost proxy, not token/wall-clock).

---

## 7.2 The ULTRA cross-model pipeline

The Workflow runtime is Claude-only (no `fetch`), so the cross-model stages run as small standalone
Node scripts that call the external APIs directly — no dependencies, plain `fetch`. They are
committed **verbatim** in [`../eval/ultra/`](../eval/ultra/) (including their original `/tmp` output
paths — read [`../eval/ultra/README.md`](../eval/ultra/README.md) first).

### Keys (never committed, never printed)

```bash
export OPENAI_API_KEY=...      # GPT-5.5 latest / GPT-5.2 prior  (adjudicator + judges)
export GEMINI_API_KEY=...      # Gemini-3.1-pro-preview latest / Gemini-2.5-pro prior  [or GOOGLE_API_KEY]
```

### Stage A — wide generation

```bash
# Claude side: Opus 7-lens panel + 3 deep draws, via the Workflow tool.
#   Its committed output is eval/ultra/raw/ultra-claude-gen.json
#   { worker, tasks:[{ id, planted_defects, claudeCands, agents }] }
# (no standalone script — Claude workers run in-Claude-Code; see eval/ultra/README.md)

# Gemini side: full + deep passes, direct Google API
node eval/ultra/gemini-gen.mjs eval/fixtures/seeded-defects-hard.json gemini-3.1-pro-preview
#   → /tmp/gemini-cands.json   (committed sample: eval/ultra/raw/gemini-cands.json)
```

### Stage B — adjudication (precision recovery)

```bash
# latest models (gpt-5.5):
node eval/ultra/ultra-adjudicate-latest.mjs \
  eval/fixtures/seeded-defects-hard.json eval/ultra/raw/ultra-claude-gen.json eval/ultra/raw/gemini-cands.json gpt-5.5
#   → /tmp/ultra-confirmed-latest.json   (committed: eval/ultra/raw/ultra-confirmed-latest.json)
# prior peak (gpt-5.2): use ultra-adjudicate.mjs → eval/ultra/raw/ultra-confirmed.json
```

### Stage C — adversarial refute (optional precision tightening)

```bash
node eval/ultra/ultra-refute.mjs \
  eval/fixtures/seeded-defects-hard.json eval/ultra/raw/ultra-confirmed.json /tmp/ultra-confirmed-refuted.json
#   two cross-model refuters (GPT + Gemini); a defect is dropped only if BOTH refute it.
#   Committed result: eval/ultra/raw/ultra-confirmed-v1refuted.json (a published NEGATIVE result —
#   refutation dropped ~nothing real, so the extra findings are genuine defects, not noise).
```

### Stage D — robust panel judge (the headline number)

```bash
node eval/ultra/ultra-judge-panel-latest.mjs eval/ultra/raw/ultra-confirmed-latest.json
#   5 cross-model judges (4× GPT-5.5 + 1× Gemini-3.1-pro-preview), majority vote per planted defect
#   → { recall:{a,b,c,overall}, precision, mean_false_positives, per_task }   (prints to stdout)
# prior peak: node eval/ultra/ultra-judge-panel.mjs eval/ultra/raw/ultra-confirmed.json
```

A single-judge variant (`ultra-judge.mjs`) is kept only to **demonstrate** the run-to-run variance
that motivates the panel — it is not the reporting path.

> The scripts above are committed in [`../eval/ultra/`](../eval/ultra/) as the **verbatim** lab
> scripts that produced [§3 Results](03-results.md), alongside the raw JSON they emitted
> ([`../eval/ultra/raw/`](../eval/ultra/raw/)) and an offline scorer
> ([`../eval/ultra/score.mjs`](../eval/ultra/score.mjs)). They are small enough to read end-to-end
> before running — do so (supply-chain hygiene — never run an opaque script against your keys). The
> only step that needs your keys is the live judging; the counts are offline-checkable without them.

---

## 7.3 What you should get

- The **hard A/B**: the panel beats the single *baseline* on recall only slightly and does **not**
  beat its own A2/A_N controls — i.e. the recall gain is lens-taxonomy + draw-count, not parallel
  structure; the panel's structural win is precision.
- **ULTRA**: on the latest models (GPT-5.5 + Gemini-3.1-pro-preview) **16/18** panel-majority recall
  at precision **0.74** (highest of any config); on the prior models (GPT-5.2 + Gemini-2.5-pro) a
  **18/18** recall peak at 0.63 — leading every single-arm config on the recall×precision frontier,
  at a deliberately high cost, on the n=6 planted fixture. (Recall/precision are the **live** Tier-2
  step; the candidate/confirmed counts behind them are offline via `score.mjs`.)
- Adding a GPT deep-generation **escalation** (V2/V3) does **not** help — it slightly trades recall
  for precision and nets out worse on recall. Simpler wins.

If your run disagrees, that is a finding — open an issue with the seed and the per-task output. The
fixture is small (n=6) and author-planted; disagreement is expected at the margins and is exactly
the kind of attack this project invites.
