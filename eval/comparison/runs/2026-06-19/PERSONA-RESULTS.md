# Persona-judge study — AI-Elon & AI-Julia on GPT-5.5 (human-preference proxy)

Per request: adopt GPT-5.5 as the judge model, and instead of a real human anchor, build two persona judges
calibrated to **real people's documented communication preferences** — **AI-Elon** (from `elon_branding` BRAND_SSOT +
`elon_youtube` strategy) and **AI-Julia** (from the `eveni`/Bot2 "magnetic sales master" directives) — and have them
judge which of A0 (plain Opus) / A1 (fablever) they'd rather receive across the 96-question battery. Both-orders,
consistency-gated, k=1. Profiles are quote-grounded (`persona-profiles.json`); all 360 verdicts committed.

## What this is and is NOT
- **IS:** a richer, human-calibrated LLM proxy — judges that score by a specific real person's documented values.
- **IS NOT:** a real human anchor, and **NOT** independent corroboration of the earlier GPT result. All three judges
  here are **GPT-5.5**, the same family that leaned pro-fablever (and that **Gemini-2.5-pro contradicted at 34%** —
  that disagreement still stands on the record). Treat persona agreement as *within-family consistency*, not a second
  opinion.
- **Built-in congruence bias:** the profiles show **both** people value exactly fablever's traits — Elon: "첫 줄이
  전부다 (the first line is everything)," "단언컨대 X (one decisive claim)," "날조 절대 금지 (never fabricate)";
  Julia: commit to the answer now, no vague deferral, no hedging, every claim evidence-backed. So a pro-A1 result is
  **preference-congruence, predictable by construction** — the informative parts are the *magnitude shift vs generic
  GPT* and the *fabrication corroboration*, not the win itself. AI-Elon is doubly circular (Elon authored fablever);
  AI-Julia is the more independent of the two.

## Three-way comparison (GPT-5.5 base; k=1; both-orders gated; A0 vs A1)
| metric | generic GPT-5.5 | AI-Elon | AI-Julia |
|---|---|---|---|
| decisive / ties (of ~90) | 78 / 12 | 71 / 19 | 72 / 18 |
| **A1 (fablever) win-rate** | **74%** [64,83] | **82%** [71,89] | **79%** [68,87] |
| exact two-sided p | <0.001 | <0.001 | <0.001 |
| first-slot win-rate (≈50% = clean) | 48% | 61% | 52% |
| A1 win-rate slot1 / slot2 | 69 / 73 | 86 / 64 | 76 / 71 |
| answer-first → A1 | 80% | 79% | 79% |
| decisiveness → A1 | 73% | 80% | 75% |
| fabrication: A0-invents-more / A1-more | 20 / 11 | 77 / 51 | **89 / 42 (2.1×)** |

## Per-category A1 win-rate %
| category | generic GPT | AI-Elon | AI-Julia |
|---|---|---|---|
| action/how-to | 88 | 93 | 93 |
| decision | 75 | 89 | 70 |
| debug | 67 | 69 | 71 |
| planning | 45 | **73** | 56 |
| explanation | 85 | 90 | **100** |
| code-review | 79 | 79 | 80 |

## Findings (honest)
1. **Within GPT-5.5, fablever wins consistently** (74–82%, all p<0.001), and human-calibration *raises* the
   preference (+5–8 pts over generic GPT). Both personas significantly prefer fablever's delivery.
2. **Not a position artifact within GPT:** at k=1 the generic GPT judge has A1 winning in **both** slots (69/73) and a
   first-slot rate of 48% — clean. (The slot-collapse in the 2-judge run came from Gemini, not GPT.) AI-Elon shows
   more slot sensitivity (86/64); AI-Julia is clean (76/71).
3. **Fabrication corroborated and amplified:** both personas flag plain Opus as inventing unrequested detail more
   often — and **AI-Julia, whose #1 documented value is "every claim must carry attached evidence," flags A0 2.1×
   more than A1** (89 vs 42). This is the most defensible cross-lens signal: a judge calibrated to a real,
   evidence-demanding, non-author human independently sees plain Opus fabricating more.
4. **answer-first is rock-solid** (~79–80% across all three).
5. **Persona divergence is sensible:** Elon's "one decisive answer, no padding" value flips *planning* to A1 (45→73)
   where generic GPT preferred the structured A0; Julia's evidence-demand drives *explanation* to 100%.

## The honest bottom line for the published claim
- **Defensible to say:** "Judged by GPT-5.5 — including two judges calibrated to real people's communication
  preferences — fablever's delivery is preferred ~74–82%, and plain Opus is independently flagged as inventing
  ~2× more unrequested detail." 
- **Must accompany it (or it's refutable):** "This is within the GPT-5.5 judge family; a different frontier judge
  (Gemini-2.5-pro) preferred plain Opus, and the two persona judges were calibrated to people who already value
  fablever's exact style, so they are congruent proxies, not independent or human ground truth."
- **The single robust, judge-independent, non-circular fact remains:** fablever **invents materially less unrequested
  detail than plain Opus** — seen by GPT, by Gemini, and by both personas — at zero cost to correctness. That is the
  claim that survives every lens tried, and it is the one to lead with.

## Method notes / limits
- 360/384 verdicts (94%); 24 dropped to persistent codex failures — does not change the picture.
- Persona judges run on GPT-5.5 via `codex` (ChatGPT auth). Profiles are extracted, quote-grounded, and committed for
  audit (`persona-profiles.json`); the calibration is auditable but is still an LLM role-conditioning, not the person.
- A real human anchor (Elon and Julia themselves, or other engineers, labeling the same blind pairs) remains the only
  thing that converts "GPT-as-Julia prefers it" into "Julia prefers it." Still the recommended next step.
