# Technique A/B — the EVIDENCE LOOP (tested independently, not ported)

A generic "don't claim done until a check shows it" pass, applied on top of fablever and measured on its own merits — our own implementation, our own 16-task A/B. It targets fablever's *own* measured weakness (unsupported "it works" claims, 8.3% in the style-only ablation). Arm A = fablever; Arm B = fablever + one evidence pass. Quality judged by **GPT-5.5 (codex)**, both orders.

| metric | A: fablever | B: + evidence-loop | direction |
|---|---|---|---|
| unsupported "it works" w/o a shown check | 18.8% | 12.5% | lower better |
| reply shows a concrete check | 56.3% | 75% | higher better |
| mean words | 217 | 384 | cost proxy |

**Quality (GPT-5.5 forced-choice):** the evidence-loop arm B won **4–12** of 16 decided (25%, p=0.0768); 0 position-bias ties.

## Observed verdict — fixes its target metric, but HURTS quality as a full pass
The loop did what it targets — unsupported claims **18.8%→12.5%**, evidence-showing **56.3%→75%** — but at a cost: it nearly doubled length (**217→384 words**) and **GPT-5.5 preferred the leaner baseline 12–4** (p=0.0768). As a full second pass the technique **over-corrects**: it trades fablever's terse decisiveness for evidence-padding the judge penalizes. **Verdict: do not adopt as-is.** The deterministic win is real, but the right version is *surgical* — add a check only where a claim is genuinely unbacked, without rewriting the whole reply. Independent GPT-5.5 judge; n=16. Validates the *technique*, not any library.