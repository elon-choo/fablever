# Real-log replay — fablever (F) vs plain Opus (B) on the operator's OWN prompts

22 self-contained prompts sampled across 22 real projects, replayed through both arms, then the SAME cached replies blind forced-choice judged by **two different-lab judges**, both orders (order-inconsistent = position-bias tie). **Privacy:** raw prompts and replies never leave the machine — only these aggregates are committed.

| judge | F (fablever) | B (plain) | order-bias ties | decided | F win-% | p | 95% CI |
|---|---|---|---|---|---|---|---|
| **Gemini-2.5-pro** | 2 | 8 | 12 | 10 | 20% | 0.1094 | [5.7, 51]% |
| **GPT-5.5** (via codex) | 14 | 3 | 5 | 17 | 82.4% | 0.0127 | [59, 93.8]% |

## The headline: this result is JUDGE-DEPENDENT
On the **identical** Opus replies, **Gemini preferred plain 8–2** while **GPT-5.5 preferred fablever 14–3** (p=0.0127). The two frontier judges *disagree*, and one of them (a non-Anthropic model judging an Anthropic-derived style) prefers fablever significantly. So the earlier single-judge read — "plain wins one-shot" — was **not robust**; it was a property of the Gemini judge, not of the replies.

## Honest scope & reading
- **Filtered subsample.** Only prompts that stand alone (no "fix that", no missing-file reference, no multi-turn context) can be replayed — the *self-contained slice* of real work, not the full distribution.
- **Single-turn.** Each prompt is replayed once with no follow-up.
- **What the disagreement means.** A forced-choice between a terse, scope-disciplined reply (fablever) and a fuller, more scaffolded one (plain) is a **taste call**, and frontier LLM judges have *different* tastes: Gemini rewards completeness/scaffolding, GPT-5.5 rewards the decisive concise answer. Neither single number is "the truth" — so the honest read is **a wash that flips on judge choice**, not a fablever negative. If anything, that a non-Anthropic judge significantly prefers fablever is a point *for* it that the Gemini-only result hid. Every other forced-choice eval in this repo that used a single Gemini judge (the style-only ablation, the productivity A/Bs) inherits this caveat and would need the same cross-judge to be trusted in either direction.

_Illustrative (SYNTHETIC, not from the logs): "Why is my flex child overflowing its container?" / "Should this retry use a fixed or exponential delay?" — the kind of standalone ask that qualifies._