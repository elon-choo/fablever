# Technique A/B — ABLATION of the "Report findings, then stop." directive

Single-variable ablation: arm **A** = full Fable style minus the report-then-stop paragraph; arm **B** = full style. Same 16 pure-question tasks (the user only asked / mused, never "fix it"), hook off (FABLE_PROFILE=off). This is the most elicitable Fable trait single-shot. Deterministic backstop = did the reply volunteer an unrequested corrected rewrite (code block); GPT-5.5 forced choice "which answered as asked without an unrequested rewrite" is primary, both orders.

| arm | unrequested-rewrite↓ | fix-language | mean words |
|---|---|---|---|
| A: no report-stop line | 68.8% | 0 | 179 |
| **B: full Fable** | 75% | 0 | 178 |

**B vs A (judge):** B won **10–4** of 14 decided (71.4%, p=0.1796); 2 position-bias ties.

## Verdict — MIXED — see metrics
Judge 10–4 (p=0.1796); unrequested-rewrite rate A 68.8% vs B 75%. Inconclusive at this n.

Independent GPT-5.5 judge; n=16; clean single-variable ablation (FABLE_PROFILE=off).