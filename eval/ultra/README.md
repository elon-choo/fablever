# `eval/ultra/` — the ULTRA pipeline: scripts + raw data behind §3 Results

This folder makes the headline defect-catch numbers in
[`../../whitepaper/03-results.md`](../../whitepaper/03-results.md) **inspectable and
re-runnable**, instead of prose only. It contains the actual lab scripts used for the
cross-model ULTRA runs and the raw JSON they produced.

> **Honesty note (read first).** These are the **verbatim** one-time-run lab scripts — including
> their hardcoded `/tmp/...` output paths. They are committed as a faithful archive ("the exact
> scripts used"), not as a polished CLI. The **raw outputs they produced are committed** under
> [`raw/`](raw/), so the deterministic numbers are checkable **offline, with no API keys** via
> [`score.mjs`](score.mjs). The final **recall/precision** line needs a **live** cross-model judge
> panel (a model call by nature) — that step is re-runnable with your own keys but is *not* offline,
> and this folder says so rather than implying the whole headline is offline-derivable.

## The fastest check (no keys, no network)

```bash
node eval/ultra/score.mjs
```

Reads [`raw/`](raw/) + the fixture and prints, per run, the **candidate-union size** and the
**confirmed-defect count** — i.e. the `402`/`417`/`455` candidate numbers and the `24`/`32`/`33`
confirmed numbers cited in §3 and the experiment log — recomputed straight from committed data.
It also asserts the committed runs cover the fixture's 6 artifacts / 18 planted defects.

## The pipeline (what produced the numbers)

The ULTRA recipe is **diverge wide → adjudicate → judge robustly**:

1. **Generate (wide union).** Two different-weights families review every artifact:
   - **Claude** — a 7-lens panel + 3 deep draws, run via the Claude Code Workflow tool (not a
     standalone API script, because the Claude workers run in-Claude-Code). Its output is committed
     as [`raw/ultra-claude-gen.json`](raw/ultra-claude-gen.json) (`{worker, tasks:[{id,
     planted_defects, claudeCands, agents}]}`).
   - **Gemini** — full + deep-only passes via [`gemini-gen.mjs`](gemini-gen.mjs) →
     [`raw/gemini-cands.json`](raw/gemini-cands.json) (and `gemini-cands-25.json`).
   - The per-artifact **union** of both is the candidate pool (the `4xx` numbers).
2. **Adjudicate (precision recovery).** One strong cross-model reasoner dedups the union and drops
   false positives → a confirmed list. [`ultra-adjudicate.mjs`](ultra-adjudicate.mjs) (prior peak,
   `gpt-5.2`) and [`ultra-adjudicate-latest.mjs`](ultra-adjudicate-latest.mjs) (latest, `gpt-5.5`)
   → [`raw/ultra-confirmed.json`](raw/ultra-confirmed.json) and
   [`raw/ultra-confirmed-latest.json`](raw/ultra-confirmed-latest.json).
3. **Judge (variance-robust scoring).** A **5-judge cross-model panel (4× GPT + 1× Gemini)** votes,
   per planted defect, whether it was caught — majority vote decides. This removes single-judge
   variance from the headline. [`ultra-judge-panel.mjs`](ultra-judge-panel.mjs) /
   [`ultra-judge-panel-latest.mjs`](ultra-judge-panel-latest.mjs). The single-judge baseline it
   replaced is [`ultra-judge.mjs`](ultra-judge.mjs) (kept so you can see *why* the panel matters —
   a lone judge said 17/18 where the panel said 18/18 on the prior run).

[`ultra-refute.mjs`](ultra-refute.mjs) is the adversarial-refute pass; its output
[`raw/ultra-confirmed-v1refuted.json`](raw/ultra-confirmed-v1refuted.json) is a **published
negative result** — refutation dropped ~nothing real, evidence the extra findings are genuine
defects, not noise. `raw/ultra-confirmed-v2.json` / `-v3.json` are the **escalation variants that
backfired** (more agents, not better) — see
[`../../whitepaper/08-experiment-log.md`](../../whitepaper/08-experiment-log.md).

## Re-run the live judging (needs your own keys)

```bash
export OPENAI_API_KEY=...   # platform.openai.com (NOT a ChatGPT login)
export GEMINI_API_KEY=...   # aistudio.google.com
node eval/ultra/ultra-judge-panel-latest.mjs eval/ultra/raw/ultra-confirmed-latest.json   # latest → ~16/18 @ 0.74
node eval/ultra/ultra-judge-panel.mjs        eval/ultra/raw/ultra-confirmed.json          # prior  → ~18/18 @ 0.63
```

Because the panel calls live models, expect small run-to-run variance — that is exactly the
variance the 5-judge majority vote is there to damp. The committed numbers are a single dated run,
labelled with the models that produced them (`models.json` → `reported_in_whitepaper`).

## Honest scope (the same limits §6 concedes)

- **n = 6 artifacts, 18 author-planted defects, single generation run.** A best-case ceiling probe,
  not a benchmark. k≥3 repeated runs and an independent (non-author) fixture are open items.
- Precision is a **floor** set by a 3-defects-per-task answer key, not a measured hallucination rate.
- The Claude generation arm ran via the Workflow tool, so its *output* is committed rather than a
  standalone script — the Gemini arm and both later stages are standalone scripts you can run.
