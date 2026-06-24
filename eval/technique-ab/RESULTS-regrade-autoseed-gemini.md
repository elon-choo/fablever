# Judge-robustness — does the SHIPPED fable-seed adherence lift hold under a SECOND judge?

The `fable-seed` skill is justified by the auto-seed A/B (arm D auto-generates the AGENTS.md by reading existing code). Its headline rests on a GPT-5.5 (codex) oracle. This re-grades the **same 9 outputs per arm** with **gemini-3.1-pro-preview** (a different lab), identical instruction. No new generation — only the judge changes.

| judge | A: no seed | D: auto seed | B: hand seed | auto preserves |
|---|---|---|---|---|
| GPT-5.5 (shipped on) | 33.3% | 88.9% | 100% | 89% |
| **gemini-3.1-pro-preview** (this check) | 22.2% | 88.9% | 100% | 89% |

## Verdict — JUDGE-ROBUST — the fable-seed adherence lift holds under a second lab
Gemini 3.1 pro, grading the SAME 9 outputs per arm with the identical instruction, reproduces the auto-seed pattern: no-seed **22.2%** → auto-seed **88.9%** → hand-seed **100%** (auto preserves **89%** of hand). GPT-5.5 had 33.3/88.9/100%. Both labs agree a generator that reads existing code carries the convention nearly as well as a hand-written file — so the shipped `fable-seed` skill's claim is **not a single-oracle artifact.**

Same outputs, two labs; n=9 conventions per arm. A judge-robustness check on a shipped skill, not a new claim.