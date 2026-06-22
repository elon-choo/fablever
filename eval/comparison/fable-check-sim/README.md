# fable_check — delivery-gate validation

Does the deterministic delivery gate (`fable_check` in `mcp/src/server.js`) actually make handed-over
deliverables better, or does it just add ceremony? This directory is the experiment that answers it.

## The result (powered run)

[`out4/RESULTS.md`](out4/RESULTS.md) — 60-task battery, gate fired on 31. Blind forced-choice pairwise
(Gemini-2.5-pro, both orders; order-inconsistent = position-bias tie), exact two-sided binomial sign
test, Wilson 95% CIs:

- **T vs C — 27 – 0**, p ≈ 1.5 × 10⁻⁸, CI [87.5, 100]%. The gate-guided revision reliably beats
  shipping the raw first draft. **Proven.**
- **T vs P — 16 – 9**, p = 0.23 (not significant). No detectable quality edge over a *generic* second
  pass — the gate's value is the deterministic structural guarantee, **not** a higher ceiling. **Conceded.**
- **C vs P — 0 – 28.** Any second pass beats the raw draft.
- **Objective, no judge:** the gate-guided revision cleared the *named* acceptance gap on **80.6%** of
  blocked tasks; the generic pass on **12.9%**.

## Arms

- **C** (control) — the raw Fable-style first draft, shipped as-is.
- **T** (treatment) — one revision *guided by the gate's specific BLOCK flags* (only on blocked tasks).
- **P** (placebo) — one revision under a generic "make it excellent" instruction, no gate flags.

## Files

- `run-mega.mjs` — the 60-task templated battery + binomial/Wilson stats (the powered run → `out4/`).
- `out4/gen/` — every generated draft (C/T/P per task). `out4/judge/` — every raw pairwise judgment.
- `out4/RESULTS.md`, `out4/results.json` — the tally.
- Earlier, smaller runs are kept for the record: `out/` (pilot), `out2/`, `out3/` (cross-model
  agreement check with Gemini-flash + partial codex/GPT-5.5), via `run-pairwise.mjs` / `run-confirm.mjs`
  / `finalize.mjs`.

## Honest scope

Cluster = task; one primary judge on the powered run (cross-model agreement was shown separately in
`out3/`). The **code** domain rarely blocks (Fable already grounds code claims), so the gate concentrates
its value in research / funnel / doc deliverables. Re-running the live generation/judging steps needs
your own `GEMINI_API_KEY` — read the runner before running (supply-chain hygiene).
