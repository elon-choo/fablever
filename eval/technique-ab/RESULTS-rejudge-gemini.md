# Judge-robustness — does the SHIPPED inline evidence-discipline hold under a SECOND judge?

The inline directive is the one change wired into production. It won on GPT-5.5 (pooled S1 vs baseline **26–6, p=0.0005**). This re-judges the **same 34 on-disk A-vs-S1 generations** with **gemini-3.1-pro-preview** (a different lab), identical instruction, both orders. No new generation — only the judge model changes.

| judge | S1 (inline) | A (baseline) | decided | S1 % | p |
|---|---|---|---|---|---|
| GPT-5.5 (shipped on) | 26 | 6 | 32 | 81.3% | 0.0005 |
| **gemini-3.1-pro-preview** (this check) | 30 | 2 | 32 | 93.8% | <0.0001 |

2 position-bias ties; 0 pairs unjudged.

## Verdict — JUDGE-ROBUST — the shipped inline directive holds under a second lab
Gemini 3.1 pro, given the IDENTICAL instruction on the SAME 34 generations, also prefers the inline arm **S1 30–2** of 32 decided (93.8%, p=<0.0001). The GPT-5.5 pooled result was S1 26–6 (p=0.0005). Two different labs agree the inline evidence-discipline produces the reply a senior engineer would rather ship — so the production change in profiles/full.md + compact.md is **not a single-judge artifact.**

Same generations, two labs; pooled n=32 decided. A judge-robustness check on a production change, not a new claim.