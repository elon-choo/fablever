# LOCKED protocol — fablever human-preference experiment (pre-registered before judging)

Derived from a 9-agent research workflow (position/length/self-enhancement bias, pairwise statistics, judge–human
agreement & panels, benchmark methodology, judge-rubric design, adversarial self-red-team) synthesized into one
runnable design. This file is the pre-registration: rubric, tests, tie rule, and by-category predictions are fixed
**before** any verdict is read. Companion: `human-preference-experiment-design.md` (rationale), `video-claims-audit.md`
(what claims are defensible). Scripts: `tools/judge-run.mjs`, `tools/analyze.mjs`.

## Claim under test (scoped, defensible)
In the **advice/Q&A regime**, fablever (A1) does not change *what* Opus answers (correctness is identical — proven
on 7 auto-oracled task classes) but changes **how the answer is delivered**, and busy developers prefer that
delivery for getting work done. We do **not** claim "words halve / tools multiply" (measured false on agentic
transcripts — see `video-claims-audit.md`), nor that the style makes Opus "more honest" as a differential effect.

## Arms (same base model, style only)
- **A0** = plain Opus 4.8 (`FABLE_PROFILE=off` + `--settings '{"outputStyle":"default"}'`): markdown-heavy default.
- **A1** = fablever (default Fable output style on): answer-first concise prose, decisive, no invented detail.
- Both `claude-opus-4-8`. A1 is typically the **shorter** arm — important for the length-bias defense below.

## Items & sampling (n locked at 96)
- **96 developer questions, 16 per category × 6**: action/how-to, decision, debug, planning, explanation, code-review
  (`prompts/preference-battery.json` 48 + `prompts/preference-battery-v2.json` 48).
- **Why 96, not 48:** power analysis (Card et al. 2020). Exact two-sided power at n=48 is only **0.47** at a true
  65% preference (0.33 at 62.5%); 80% power needs ~96 items. For a *confirmatory* claim defending a published video,
  48 risks a false null — so we pre-commit to 96. (Generation: 96 × 2 arms × k=2 = **384 responses**.)
- **Unit of analysis = the QUESTION (n=96)**, never the individual judge call. The multiple judgments per question
  are repeated measures of one cluster; treating 768 calls as independent inflates significance ~2× and is the #1
  skeptic attack. Each question reduces to `y_i` = fraction of order-consistent decisive judgments favoring A1.

## Judges (two non-Claude families)
- **Gemini-2.5-pro** (Google API) — least position-biased frontier judge per the research; primary, k=2.
- **GPT-5.5** (via `codex exec`; the OpenAI API key has no quota, codex uses ChatGPT auth) — the *adversarial*
  judge (GPT-class carries the stronger pro-length bias, which works against the shorter A1), cross-family check, k=1.
- Both are **non-Claude** and never told the fablever spec or model names. Because **both arms come from the same
  Opus base**, self-enhancement/family bias cannot favor either arm regardless of judge. Headline requires the A1>A0
  direction to **hold under each judge independently** (minimal Panel-of-LLM-evaluators, Verga et al. 2024).

## Judging procedure (position bias killed by construction)
- Every matched A0/A1 pair is judged in **both slot orders** (slot1=A0/slot2=A1 AND slot1=A1/slot2=A0) by each judge.
- **Consistency gate (tie rule):** a pair is *decisive* for a judge only if it prefers the **same arm in both orders**;
  if the two orders disagree (position-flip), it is a **TIE and excluded** (Zheng et al. MT-Bench rule) — never split
  50/50. Inside a single call the verdict is **forced binary** (no casual tie; casual ties cause ~40% false-neutral
  laziness). The flip/tie rate is reported as the residual position-bias number.
- **Rubric = Proof-Before-Preference:** persona "you are the busy developer who ASKED this and must act NOW";
  explicit **length-neutrality clause** ("do NOT reward length; at equal correctness prefer the answer that lets you
  act faster"); per-criterion notes **citing spans** (answer-first, decisiveness, fabrication, actionability) emitted
  **first and locked**, `overall_winner` **last**. Arms anonymized Assistant A/B; de-anonymized only post-hoc.
- Counts: Gemini 96×2×2 = 384 calls; GPT 96×1×2 = 192 calls; **576 judgments** total.

## Statistics (pre-registered)
- **PRIMARY:** two-sided **exact binomial (sign) test** of decisive-question A1-wins vs p0=0.5 (exact form of paired
  McNemar; report exact, never normal-approx). Bright line at n=96: need **≥58/96 decisive wins (60.4%)** for p≤.05.
- **CI:** **cluster bootstrap resampling questions** (not judgments), B=10,000, 95% percentile CI; significant iff it
  excludes 50%. Plus **Wilson** score interval (small-n correct; not Wald) as a sanity check.
- **Position diagnostics (the rebuttal artifacts):** overall first-slot win-rate (must sit ~50% → counterbalancing
  held); **A1 win-rate split by slot** (A1 must win in *both* slots → position cannot be the driver); flip rate.
- **Length control (3 independent layers):** (1) **AlpacaEval-2.0 length-controlled win-rate** (Dubois et al. 2024)
  — report side-by-side with raw + the SIGN of the length coefficient (expected positive = favors the longer A0);
  (2) **length-stratified** A1 win-rate in |Δwords| bins, headline = near-equal-length stratum (model-free);
  (3) adversarial **verbosity-gaming probe** (pad A1 to A0 length / truncate A0). Framing: judges carry a documented
  **+17.3% pro-length bias** (MTalk-Bench) while A1 is the *shorter* arm, so any raw A1 win is **against a tailwind
  for A0** → raw *understates* A1; LC win-rate expected ≥ raw.
- **Inter-judge agreement:** Cohen's **κ** (chance-corrected; raw % alongside, never alone) GPT vs Gemini, overall +
  per-category. Bar (Landis-Koch): κ≥0.61 substantial. If only moderate, the robust claim is **concordant direction**
  across families, not high κ.
- **Per-category:** Wilson CIs, **descriptive only** (n=16/cat; significance only on a near-sweep, Holm-Bonferroni if claimed).

## Pre-registered by-category predictions (published BEFORE judging)
Winning *every* category — including the predicted-loss ones — would itself be a red flag for concision/style-gaming,
so we predict losses too. A genuine usefulness effect should vary sensibly across categories.
- **A1 strong (predict clear win):** action/how-to, decision, debug — answer-first + one decisive recommendation maps
  directly to "get the busy asker acting now."
- **A1 moderate (slight win/even):** planning — concise prose helps but some structure is genuinely useful.
- **A1 predicted LOSS or tie:** explanation, code-review — these reward enumerated thoroughness, where A0's longer
  structured form has legitimate information mass. **A flat win across all 6 = artifact, not preference.**

## Threats → controls (the rebuttal table)
| rebuttal | neutralizing control |
|---|---|
| "won only because shorter / brevity-gaming" | judges are +17.3% pro-LENGTH biased → A1 wins *against* the bias; LC-GLM + near-equal-length stratum show it holds at equal length |
| "position/slot order drove it" | both-orders counterbalancing + consistency gate → net position ~0; A1 wins in BOTH slots; first-slot win-rate ~50% |
| "Claude grading itself" | non-Claude judges (GPT+Gemini); both arms same Opus base → self-preference can't favor either; judges blind to names/spec |
| "one judge's quirk" | heterogeneous panel; direction required under EACH; Cohen's κ + cross-family concordance |
| "just markdown/formatting" | LMSYS style-control regression separates formatting (Arena coef 0.02–0.03) from length (0.25); edge survives style control |
| "null-model / non-answer cheat" | A1 gives real answers with separately auto-oracled correctness on public questions; all 384 responses released for re-judging |
| "cherry-picked / p-hacked categories" | pre-registered predictions incl. predicted A1 LOSSES; Holm-Bonferroni; categories descriptive only |
| "pseudo-replication inflated p" | unit = question (n=96); cluster bootstrap over questions, not 576 calls |
| "underpowered noise" | n=96 → 80% power at true 65%; exact p + Wilson + bootstrap CI all reported |
| "concision hurt correctness" | correctness already auto-oracled EQUAL (7 task classes); carried as a parity control |

## Open items requiring the USER (cannot be done autonomously)
1. **Human anchor slice (strongly recommended):** 100–300 **human** pairwise labels on a blind, position-balanced
   subset — the cheapest insurance against "your LLM judge is a gameable proxy" and the bridge to a real human-pref
   claim (MT-Bench: LLM-judge ~85% vs human-human 81% agreement). Requires recruiting people; the blind packet can be
   auto-generated from the captured responses on request.
2. **Third judge family:** only Google (Gemini) + ChatGPT (GPT-via-codex) are reachable here; no Llama/Mistral key.
   A third independent family would strengthen the panel and break GPT–Gemini ties — needs an additional credential.
3. **External question provenance:** the 96 questions are realistic but author-written; sourcing some from an external
   public set (e.g. real StackOverflow FAQs) would fully defeat the "self-selected categories" attack.

## Limits stated up front (armor, not weakness)
- The edge is **concentrated on action-oriented advice**; it narrows/reverses on explanation & code-review (predicted).
  fablever is a *delivery preference for action work*, not a universal upgrade.
- Correctness is **identical**, not better — the whole value is "preferred delivery at zero cost to substance."
- "Satisfaction" is ultimately human; the LLM-judge panel is an objective *proxy* chosen to avoid subjective human
  scoring. Item 1 is the bridge if a skeptic rejects the proxy.
