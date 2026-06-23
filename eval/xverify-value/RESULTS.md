# Cross-model (xverify) value — does a 2nd-lab reviewer catch what one model misses?

13 snippets, 34 authored ground-truth defects. Reviews use fablever style ON (realistic install). Three reviews per snippet: two independent Claude passes (claudeA/claudeB) and one Gemini-2.5-pro pass. An independent grader maps each review's findings onto the planted defects.

| arm | what it is | recall (planted defects caught) |
|---|---|---|
| **S** single Claude | claudeA only | **100%** (34/34) |
| **D** Claude ×2 | claudeA ∪ claudeB (control: "just review twice") | **100%** (34/34) |
| **X** cross-model | claudeA ∪ Gemini (the +xverify design) | **100%** (34/34) |

## Where the extra catches come from
- Defects a **second Claude pass** newly caught over single: **0**
- Defects **Gemini** newly caught over single Claude: **0**
- Defects **only the cross-model 2nd lab caught** (neither Claude pass found): **0**

## False-positive proxy (extra issues raised beyond the planted set)
- single: 154 · Claude×2: 300 · cross-model: 229

## Observed result
Single Claude caught **100%** of the planted defects — including the subtle batch (DST off-by-one, ReDoS, float-money, never-returns-0 comparator). Adding a second pass changed recall by **nothing**: the second Claude pass newly caught **0**, Gemini newly caught **0**, and **0** defects were caught *only* by the cross-model lab. Both union arms instead raised the extra-issue count (single 154 → cross-model 229 → Claude×2 300). The grader is not rubber-stamping — on the first (clearer) batch it marked Gemini's misses, and it discriminates per-defect. **So on defect-catch with a strong base reviewer at ceiling, cross-model verification buys zero extra recall and more triage cost.** That is the honest case for gating +xverify to genuinely high-stakes review (where even a tiny marginal catch is worth the noise) rather than turning it on by default. Where cross-model *could* still pay off — and this eval does NOT test — is judgment calls and design review, not enumerable defects. Single judge/grader model; n=34 defects.