# Multi-step gate value — style-only (F) vs default install with the fable_check gate (D)

20 multi-part tasks (75 authored checkpoints), same base model (claude-opus-4-8). Arm F = one fablever-style pass; Arm D = that draft then a fable_check-style gate pass (the default-install behavior). An independent Gemini oracle marks each checkpoint present/absent. This isolates whether the GATE — not the style — closes multi-step gaps.

| metric | F (style-only) | D (+ gate) | direction |
|---|---|---|---|
| checkpoint completeness | 100% | 100% | higher better |
| overall acceptance (complete & actionable) | 100% | 100% | higher better |

- Tasks the gate improved (more checkpoints met): **0**
- Tasks the gate regressed: **0**
- Sign test that the gate helps: p=null

## Observed result
Both arms hit **100%** checkpoint completeness across 20 multi-step tasks (incl. 8 harder 5-part ones); the gate improved **0** tasks and regressed **0**. The oracle is **not** rubber-stamping: a negative-control reply with parts deliberately omitted was correctly flagged incomplete (c3=false c5=false complete=false → PASS). So fablever **style-only is genuinely complete on this task class**, and the default-install gate's value is **not** multi-step completeness — there were no gaps to close. The honest implications: recommend **style-only** for multi-step deliverables, and reserve the gate for what it is actually for (catching an unverified "it works" before delivery, external-facing review) rather than as a completeness booster. The gate costs a second model call for no measured completeness gain here. n=20, single oracle model.