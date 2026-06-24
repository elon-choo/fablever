# Technique A/B — ABLATION of the "Lead with the outcome." directive

Single-variable ablation: arm **A** = full Fable style minus the lead-with-outcome paragraph; arm **B** = full style. Same 16 analysis questions with a crisp bottom line, hook off (FABLE_PROFILE=off). Deterministic backstop = is the verdict in sentence 1 vs a walkthrough opener; GPT-5.5 forced choice "which leads with the outcome" is primary, both orders.

| arm | verdict-in-sentence-1↑ | walkthrough-opener↓ | mean words |
|---|---|---|---|
| A: no lead-outcome line | 12.5% | 0% | 185 |
| **B: full Fable** | 31.3% | 0% | 201 |

**B vs A (judge):** B won **6–10** of 16 decided (37.5%, p=0.4545); 0 position-bias ties.

## Verdict — MIXED — see metrics
Judge 6–10 (p=0.4545); verdict-first A 12.5% vs B 31.3%; walkthrough A 0% vs B 0%. Inconclusive at this n.

Independent GPT-5.5 judge; n=16; clean single-variable ablation (FABLE_PROFILE=off).