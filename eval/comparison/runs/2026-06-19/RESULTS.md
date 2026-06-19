# Pre-registered n=96 two-judge preference study — RESULTS (honest)

Run of the locked protocol (`../../preference-eval-protocol-LOCKED.md`). 96 developer questions × 2 arms × k=2 =
**384 responses**; **546 judgments** from two non-Claude families (Gemini-2.5-pro + GPT-5.5-via-codex), every pair
in both slot orders, consistency-gated. Unit of analysis = the question (n=96). Full responses + per-call verdicts
are committed alongside this file for independent re-judging.

**Bottom line:** the rigorous test does **NOT** support a broad "people prefer fablever" claim — the overall
preference is judge-dependent, position-sensitive, and not statistically significant. But two benefits are **robust
across both independent judges** and are the defensible findings: fablever **leads with the answer more often** and
**invents 2–3× fewer unrequested details** than plain Opus. The earlier 11/12 (~92%) pilot was a single-judge (GPT),
small-n, action-category artifact and does not generalize.

## Primary metric — NULL
| | value |
|---|---|
| A1 (fablever) preferred | **44 / 78 decisive questions = 56.4%** |
| exact two-sided binomial p | **0.31 (not significant)** |
| Wilson 95% CI | [45.4%, 66.9%] — includes 50% |
| cluster-bootstrap 95% CI (over questions) | [44.9%, 66.7%] — includes 50% |
| ties (position-flip or split) | 18 / 96 questions; pair-level flip rate 29.3% |

At n=96 the bright line for significance was ≥58/96; we got 56%. **No overall preference effect.**

## Why it's null — the two failures the rigor exposed
**1. The two judge families point in OPPOSITE directions (pre-registered "must hold under each judge" → FAILED):**
| judge | A1 win-rate | p | leans |
|---|---|---|---|
| GPT-5.5 | 74.4% | <0.0001 | strongly prefers fablever |
| Gemini-2.5-pro | 34.4% | 0.017 | significantly prefers plain Opus |

Inter-judge Cohen's κ = 0.58 (moderate item agreement) but the *aggregate* leans are opposite. The preference is a
property of **which judge you ask**, not a stable human-style fact. This is exactly the artifact a single-judge pilot
hides — and why the protocol mandated two families.

**2. Position bias was not fully neutralized, and A1's edge is partly a slot artifact:**
- overall first-slot win-rate **61.4%** (should be ~50% under clean counterbalancing) — these judges carry strong
  first-position bias.
- A1 win-rate when shown **first = 64.5%**, when shown **second = 41.8%**. The pre-registered "A1 must win in BOTH
  slots" test **fails**: fablever's short answer-first reply wins when seen first, but loses after the reader has
  already read plain Opus's longer structured answer. Much of GPT's pro-A1 lean rides on position.

(The consistency gate still removed order-flipped pairs as ties, so the 56.4% primary is *after* that control — the
slot split above is the raw diagnostic showing how fragile the apparent edge is.)

## What IS robust — confirmed by BOTH independent judges
| signal | Gemini | GPT | verdict |
|---|---|---|---|
| **answer-first** (states the actionable answer in sentence 1) | A1 61% | A1 80% | **robust — fablever leads with the answer** |
| **fabrication** (invents repo/API/file details never given) | A0 invents-more **3.1×** | A0 invents-more **1.8×** | **robust — fablever invents 2–3× less** |
| decisiveness (commits to one recommendation) | A1 49% | A1 73% | NOT robust (judge-dependent) |
| actionability | ~tied | — | weak |

The **reduced fabrication is the strongest, most defensible result**: even Gemini, which prefers plain Opus overall,
independently judges that plain Opus invents unrequested detail ~3× more often than fablever. Across 546 judgments,
A0 was flagged the bigger fabricator 106 times vs A1's 39. Inventing detail the user never gave is a thing engineers
actively distrust (you must re-verify it) — so "fablever hallucinates less context" is a real, judge-independent,
honest benefit, at zero cost to correctness (correctness parity proven separately on 7 auto-oracled task classes).

## By category (descriptive; pre-registered predictions mostly NOT matched)
| category | A1 win-rate | predicted | matched? |
|---|---|---|---|
| action/how-to | **81%** (Wilson 57–93) | strong A1 | ✓ (the one clean win) |
| decision | 58% | strong A1 | partial |
| debug | 46% | strong A1 | ✗ |
| planning | 33% | moderate A1 | ✗ (A0 wins) |
| explanation | 50% | A1 loss/tie | ~ |
| code-review | 60% | A1 loss/tie | ✗ (A1 wins) |

Only **action/how-to** behaves as predicted (and even there the pooled number is GPT-weighted). The predicted pattern
(strong on action/decision/debug, weak on explanation/review) did **not** hold — the effect is noisier and more
judge-driven than a clean "answer-first helps action questions" story. The honest read: fablever's delivery has a
real edge on pure *how-do-I-X* questions, and is otherwise a wash that depends on the judge.

## Length
A1 is 15% shorter (mean 345 vs 407 words). Length-stratified A1 win-rate: near-equal-length **43%**, moderate-Δ 69%,
large-Δ 56%. fablever does **not** win at near-equal length — so we cannot claim "wins even at equal length." (It also
means the GPT-side wins are not purely a brevity reward; they track the moderate-length-difference band.)

## Honest conclusion (what to claim, what to drop)
- **DROP:** "people/judges prefer fablever's delivery" as a broad claim. Under two judges + both-orders + n=96 it is
  null (56%, p=0.31) and judge-dependent (GPT yes, Gemini no). The 11/12 pilot does not replicate.
- **KEEP (robust, judge-independent, defensible):**
  1. **fablever invents 2–3× fewer unrequested details than plain Opus** (both judges; even the A0-preferring one).
  2. **fablever leads with the actionable answer more often** (both judges).
  3. On **action/how-to** questions specifically, fablever's reply is preferred (81%, pooled).
- **FRAME:** "same correctness, leaner delivery, and materially less invented detail — with overall preference being
  a matter of taste (one frontier judge prefers it, another prefers plain's structure)." That is the truth and it is
  still a real, useful, honest selling point — especially the lower fabrication rate.

## Method honesty / limits
- Residual first-position bias (61%) means even the gated primary slightly flatters whichever arm benefits from slot
  effects; reported transparently rather than hidden.
- GPT judged k=1 (192 calls) vs Gemini k=2 (384) due to ChatGPT-quota caution, so the pooled metric is Gemini-weighted
  — which makes the null *conservative* toward A1 (Gemini is the A0-preferring judge); per-judge numbers are reported
  separately and are the honest unit.
- 546/576 judgments completed (95%); 30 dropped to persistent judge/API failures. Does not change the picture.
- Still an LLM-judge proxy: a human-anchor slice (see protocol §"Open items") remains the decisive next step and
  needs real human labelers.
