# 7 · Reproduce — re-run every number yourself

Everything in this folder is executable. The controlled A/B ships in the repo; the ULTRA
cross-model pipeline uses small standalone scripts plus your own API keys. No result here
asks you to trust a screenshot.

---

## 7.1 The controlled A/B (in-repo, Claude-only)

The 4-arm harness lives at `eval/ab-harness.mjs` and runs through the Workflow tool.

```bash
# from the repo root, with Claude Code available
node eval/ab-harness.mjs eval/fixtures/seeded-defects-hard.json
```

It runs arms **A / A2 / A_N / B** on each artifact, swaps the worker Opus→Sonnet as the
placebo control, and reports per-stratum recall plus `caught_per_agent`. The fixtures:

- `eval/fixtures/seeded-defects.json` — the seed (n=2). **Saturated** — a single strong
  agent already catches everything, so the panel shows as pure cost. Kept as the
  ceiling-effect demonstration.
- `eval/fixtures/seeded-defects-hard.json` — the hard fixture (n=6, 18 planted defects,
  stratified a/b/c). This is the one with real headroom.

See `eval/README.md` for the pre-registered decision rule and its honest caveats
(n is small; `caught_per_agent` is an agent-count cost proxy, not token/wall-clock).

---

## 7.2 The ULTRA cross-model pipeline

The Workflow runtime is Claude-only (no `fetch`), so the cross-model stages run as small
Node scripts that call the external APIs directly. They are intentionally simple and
auditable — no dependencies, plain `fetch`.

### Keys (never committed, never printed)

```bash
export OPENAI_API_KEY=...      # GPT-5.2 (adjudicator + judges)
export GEMINI_API_KEY=...      # Gemini-2.5-pro (generation + one judge)  [or GOOGLE_API_KEY]
```

### Stage A — wide generation

```bash
# Claude side: Opus 7-lens panel + 3 deep draws, via the Workflow tool
#   → produces ultra-claude-gen.json  { tasks:[{ id, planted_defects, claudeCands, agents }] }
# (this is the wide-generation workflow; see orchestration/ for the recipe shape)

# Gemini side: full + deep passes, direct Google API
node gemini-gen.mjs eval/fixtures/seeded-defects-hard.json gemini-2.5-pro
#   → gemini-cands.json   { task_id: [ findings ] }
```

### Stage B — adjudication (precision recovery)

```bash
node ultra-adjudicate.mjs \
  eval/fixtures/seeded-defects-hard.json ultra-claude-gen.json gemini-cands.json gpt-5.2
#   → ultra-confirmed.json   { adjudicator, agents_total, n_candidates_total, tasks:[…confirmed…] }
```

### Stage C — adversarial refute (optional precision tightening)

```bash
node ultra-refute.mjs \
  eval/fixtures/seeded-defects-hard.json ultra-confirmed.json ultra-confirmed-refuted.json
#   two cross-model refuters (GPT-5.2 + Gemini); a defect is dropped only if BOTH refute it
```

### Stage D — robust panel judge (the headline number)

```bash
node ultra-judge-panel.mjs ultra-confirmed.json
#   5 cross-model judges (4× GPT-5.2 + 1× Gemini), majority vote per planted defect
#   → { recall:{a,b,c,overall}, precision, mean_false_positives, per_task }
```

A single-judge variant (`ultra-judge.mjs`) is kept only to **demonstrate** the run-to-run
variance that motivates the panel — it is not the reporting path.

> The standalone `*.mjs` scripts above are the exact ones used to produce
> [§3 Results](03-results.md). They are small enough to read end-to-end before running;
> doing so is encouraged (supply-chain hygiene — never run an opaque script against your
> keys).

---

## 7.3 What you should get

- The **hard A/B**: the panel beats the single *baseline* on recall only slightly and
  does **not** beat its own A2/A_N controls — i.e. the recall gain is lens-taxonomy +
  draw-count, not parallel structure; the panel's structural win is precision.
- **ULTRA**: on the latest models (GPT-5.5 + Gemini-3.1-pro-preview) **16/18** panel-majority
  recall at precision **0.74** (highest of any config); on the prior models (GPT-5.2 +
  Gemini-2.5-pro) a **18/18** recall peak at 0.63 — leading every single-arm config on the
  recall×precision frontier, at a deliberately high cost, on the n=6 planted fixture.
- Adding a GPT-5.2 deep-generation **escalation** (V2) does **not** help — it slightly
  trades recall for precision and nets out worse on recall. Simpler wins.

If your run disagrees, that is a finding — open an issue with the seed and the per-task
output. The fixture is small (n=6) and author-planted; disagreement is expected at the
margins and is exactly the kind of attack this project invites.
