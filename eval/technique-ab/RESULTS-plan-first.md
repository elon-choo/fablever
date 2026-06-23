# Technique A/B — PLAN-FIRST artifact (tested independently, not ported)

A generic "write the plan before you build" technique, applied to fablever and measured on its own merits — our own implementation, our own 12-task A/B on deliberately hard 5-part tasks. Arm A = fablever straight to the deliverable; Arm B = an explicit numbered plan first (call 1), then execution against it (call 2). Judged by **GPT-5.5 (codex)**, both orders.

| | B: plan-first | A: direct | ties | decided | B win-% | p | 95% CI |
|---|---|---|---|---|---|---|---|
| forced-choice | 9 | 1 | 2 | 10 | 90% | 0.0215 | [59.6, 98.2]% |

## Observed verdict — clear WIN on hard multi-step work
Plan-first (B) won **9–1** of 10 decided (**90%, p=0.0215** — significant). On deliberately hard 5-part tasks, externalizing a plan before executing produces a clearly better deliverable. **Verdict: adopt for hard multi-step work.** (Note: the multistep-gate eval found fablever already 100% on a completeness *checklist* — but a forced-choice quality judge on harder tasks shows the plan still improves organization/correctness beyond bare coverage. The cost is one extra model call.) Independent GPT-5.5 judge; n=12. Validates the *technique*, not any library — the plan-artifact idea is universal.