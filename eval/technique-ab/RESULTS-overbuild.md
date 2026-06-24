# Technique A/B — ABLATION of the "Don't over-build." directive

A single-variable ablation: arm **A** is the full Fable output style with the over-build paragraph REMOVED; arm **B** is the full style. Same 16 narrow, scope-creep-tempting requests; the only difference is that one line. Hook disabled (FABLE_PROFILE=off) so the style is the sole steering source. Deterministic creep score (unrequested try/catch, validation, tests, docs, helpers, "I also…" phrases) + GPT-5.5 forced choice "which did EXACTLY what was asked, nothing extra", both orders.

| arm | creep↓ | clean(0)↑ | words | code lines | try/catch | throws | guards | tests | bonus phrases |
|---|---|---|---|---|---|---|---|---|---|
| A: no over-build line | 0.25 | 81.3% | 55 | 3 | 0.06 | 0 | 0 | 0 | 0 |
| **B: full Fable** | 0.25 | 75% | 57 | 2.94 | 0.06 | 0 | 0 | 0 | 0 |

**B vs A (judge):** B won **10–5** of 15 decided (66.7%, p=0.3018); 1 position-bias ties.
**Creep delta:** A 0.25 → B 0.25 (the directive did not reduce scope-creep).

## Verdict — BOUNDED NULL — redundant here, a lean-packaging candidate
Removing the directive did NOT raise scope-creep (A 0.25 vs B 0.25) and the judge split 10–5 (p=0.3018, n.s.). On single-shot narrow tasks the rest of the Fable style ("act when you have enough", "no filler") already suppresses gold-plating, so this one line is **redundant for these tasks** — its real value, if any, is in long multi-step sessions a single-shot A/B can't see (the harness paradox). Honest call: not load-bearing here; safe to shorten if leaner packaging is the goal, but keep pending a long-session holdout read.

Independent GPT-5.5 judge; n=16; clean single-variable ablation (FABLE_PROFILE=off, output style the only manipulated variable).