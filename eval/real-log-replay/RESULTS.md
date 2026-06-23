# Real-log replay — fablever (F) vs plain Opus (B) on the operator's OWN prompts

22 self-contained prompts sampled across 22 real projects, replayed through both arms, blind forced-choice (Gemini-2.5-pro, both orders; order-inconsistent = position-bias tie). **Privacy:** raw prompts and replies never leave the machine — only these aggregates are committed.

| | F (fablever) | B (plain) | order-bias ties | decided | F win-% | p | 95% CI |
|---|---|---|---|---|---|---|---|
| forced-choice | 2 | 8 | 12 | 10 | 20% | 0.1094 | [5.7, 51]% |

## Honest scope & reading
- **Filtered subsample.** Only prompts that stand alone (no "fix that", no missing-file reference, no multi-turn context) can be replayed — so this is the *self-contained slice* of real work, not the full distribution. Conversational follow-ups and context-dependent asks (where fablever's persistence across a session matters most) are exactly what this CANNOT measure, so it bounds the effect, if anything, downward.
- **Single-turn.** Each prompt is replayed once with no follow-up, so it shares the productivity A/Bs' bias: terser deliverables can read as less complete to an LLM judge.
- **Observed:** on these 22 real one-shot prompts, plain Opus was preferred **8–2** among the 10 decided (fablever 20% win, p=0.1094, n.s.); 12 were position-bias ties. So on single-shot real work fablever does **not** win — consistent with the productivity A/Bs and the style-only ablation (terser deliverables read as less complete to an LLM judge). This is the expected outcome for a **style/discipline** layer rather than a capability boost; fablever's measured value lives in scope discipline and persistence across a session, neither of which a one-shot replay can capture.

_Illustrative (SYNTHETIC, not from the logs): "Why is my flex child overflowing its container?" / "Should this retry use a fixed or exponential delay?" — the kind of standalone ask that qualifies._