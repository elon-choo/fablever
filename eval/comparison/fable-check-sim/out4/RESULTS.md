# fable_check — large-scale powered re-test

60 tasks; gate fired on **31/60** (51.7%). Blocked by domain: research 14, funnel-design 14, doc-planning 2, marketing-copy 1. Forced-choice pairwise (Gemini-2.5-pro), both orders, order-inconsistent = tie. Win-% is of decided (non-tie) pairs; p = exact two-sided binomial sign test vs 50/50; CI = Wilson 95% on the leading arm's share of decided.

| comparison | wins | decided n | win-% | p (two-sided) | 95% CI | meaning |
|---|---|---|---|---|---|---|
| T vs C | 27–0 (ties 4) | 27 | 100% | 0 | [87.5, 100]% | gate-fixed vs raw draft |
| T vs P | 16–9 (ties 6) | 25 | 64% | 0.2295 | [44.5, 79.8]% | deterministic gate vs generic 2nd pass |
| C vs P | 0–28 (ties 3) | 28 | 0% | 0 | [0, 12.1]% | raw vs any 2nd pass |

**Objective (no judge):** gate-guided revision T cleared the gate on **80.6%** of blocked tasks; generic P on **12.9%**.

Cluster = task; one judge (cross-model agreement already shown in out3). The code domain rarely blocks (Fable already grounds code claims), so the gate concentrates value in research/funnel/doc. Reading: a low p on T-vs-C with CI well above 50% = the gate reliably beats shipping the raw draft; a high p on T-vs-P with CI spanning 50% = no detectable quality edge over a generic second pass (the gate's edge is the deterministic structural guarantee, not a higher ceiling).