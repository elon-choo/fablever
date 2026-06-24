# Handoff / Context-Reload layer — pre-registered A/B (this lab: GPT-5.5 / codex)

Single-variable: arm **A** = full Fable style; arm **B** = Fable + one directive. Same tasks, model claude-opus-4-8, FABLE_PROFILE=off (style is the only steering source). Reports generate in Korean (machine global rule); judge + backstops bilingual. Forced choice both orders, position-bias ties dropped, exact binomial sign test (p<0.05 is the binding bar at n=16 ≈ 81% of decided; the 70% floor does not bind at this n).

**The [Handoff Summary] block is unblindable to a forced-choice judge, so the judge tally alone confounds value with packaging-recognition.** Always-on ELIGIBILITY therefore requires, under BOTH labs: (1) the judge win (p<0.05) AND (2) an arm-neutral backstop in the same direction (B surfaces the decision earlier/more in the head) AND (3) E2 shows the directive self-gates on short tasks. The on-demand SKILL ships regardless; only the always-on profile edit is gated. A judge-only win is treated as a packaging preference, not value.

## E1 — decision-surfacing / reload (preference + arm-neutral backstop; not a blinded latency proof)

| arm | top-block present¹ | decision in head | file:line in head² | chars→decision↓ | words |
|---|---|---|---|---|---|
| A: full Fable | 0% | 100% | 0% | 87 | 632 |
| **B: + handoff** | 60% | 100% | 0% | 99 | 532 |


¹ block-present is a MANIPULATION CHECK (B is built to emit it; expected to favor B) — not value evidence. ² file:line-in-head is partly instruction-driven (B is told to pin one); the load-bearing arm-neutral metrics are decision-in-head and chars→decision, which fairly credit arm A’s natural phrasing.

**B vs A (judge):** B won **11-2** of 13 decided (84.6%, p=0.0225); 2 ties.

### Verdict — E1 JUDGE-ONLY (this lab) — judge prefers B, but the arm-neutral backstop does not
B won the judge 11-2 (84.6%, p=0.0225) but did NOT also surface the decision earlier in the head (chars→decision A 87 vs B 99; decision-in-head A 100% vs B 100%). That pattern is consistent with a packaging/form preference rather than genuine earlier reload — NOT eligible for the always-on edit.

## E2 — short-task noise (trigger-gating justification)

### Verdict — DIRECTIVE SELF-GATES — B rarely emits the block on short tasks (safe for always-on)
On 12 short throwaway tasks, arm B emitted a handoff block **0%** of the time (A 0%); leaner-reply judge B-vs-A 6-6 (50%). Mean words A 46 vs B 52. The "skip on short turns" clause works on its own → the directive does not spam trivial turns.

## E4 — 3-retry boundary (single-shot PROXY)

### Verdict — RETRY DIRECTIVE — bounded/null (proxy)
Recoverable early-escalation: A 11.1% vs B 11.1% (lower is better). Self-correct on recoverable: A 77.8% vs B 88.9%. Destructive wrong-direction (proceeded without sign-off): A 33.3% vs B 0% (lower is better — this is a FIRST-DISPOSITION measure, NOT a retry COUNT; a single-shot proxy cannot observe how many times a model would retry). Destructive correct-stop: A 66.7% vs B 100%. PROXY: single-shot text, not a real tool-retry loop — directional only, never gates the ship.


Independent GPT-5.5 (codex) judge; E1 n=15, E2 n=12, E4 n=12. Clean single-variable, FABLE_PROFILE=off. Final ship decision waits on the Gemini second lab.