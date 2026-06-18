# Automatically judging "which model produced the better work" — research + a design that won't fool us

Asked: human raters are subjective — can we **automatically** decide whether A1 (fablever) or A0 (plain
Opus) produced the better work product? Short answer: **yes, the method exists (LLM-as-judge), but for THIS
specific comparison it has two confounds that would manufacture a fake fablever win, and on our saturated
tasks even a perfect judge can only return a tie.** Below is the method, the traps, and a design that
survives them.

## The established method
- **LLM-as-judge, pairwise:** give a judge model two outputs for the same task and have it pick the winner
  (or score each on a rubric). Reported ~90% agreement with human judgments on general tasks.
- **Standard frameworks:** AlpacaEval 2.0, Arena-Hard-Auto, MT-Bench — automated pairwise win-rate
  leaderboards using a strong judge model.
- **For code/work specifically:** judge on rubric dimensions the binary oracle can't see — correctness,
  completeness, edge-case coverage, minimality of diff, readability/maintainability — each scored, or a
  pairwise "which better satisfies the spec without breaking anything."

## The three traps that would specifically corrupt OUR comparison
1. **Verbosity bias → would hand fablever a fake win.** Judges tend to reward longer answers. We measured
   fablever's outputs as *longer* (92 vs 70 final-message words; 1608 vs 1033 output tokens). A naive judge
   would likely prefer A1 for length, not quality. **Fix:** AlpacaEval 2.0's **length-controlled (LC) win
   rate** (estimates the counterfactual preference if both answers were equal length — raised correlation
   with human judgment from 0.94→0.98), or **AdapAlpaca** word-count-interval matching. Without LC, any
   "fablever wins" result here is untrustworthy.
2. **Self-preference bias → a Claude judge would favor fablever.** Judges favor outputs resembling their own;
   fablever IS a Claude working style, so a Claude judge is disqualified. **Fix:** judges must be
   **non-Claude** (GPT, Gemini), ideally a disjoint-family ensemble. (I can run a GPT judge via the codex
   MCP, which is non-Claude — that satisfies this without the user's keys.)
3. **Position bias.** Judges favor the first/last-shown answer (~10% effect). **Fix:** run each pair twice
   with order swapped, average; drop pairs whose verdict flips (order-sensitive).

## The honesty backstop (do not skip)
"Cheating Automatic LLM Benchmarks: Null Models Achieve High Win Rates" (ICLR 2025) shows a **constant,
content-free output can score high win rates** on these automated benchmarks. So a judge "win" is **not**
proof of better work. Required sanity check: include a **null/baseline arm** (e.g. the minimal reference
solution, or a deliberately terse constant) — if it wins or ties the real arms, the judge is measuring
artifact, not quality, and the result is void.

## The design that answers the question honestly
1. **Executable oracle = correctness floor (kept).** Binary pass/fail from the committed tests. No judge
   overrides correctness.
2. **Debiased judge ensemble ABOVE correctness.** For runs that both pass, a non-Claude pair (GPT via codex
   MCP + Gemini if keys) scores the dimensions the oracle can't: completeness, edge-cases, **minimal diff /
   no needless change**, maintainability. With: position-swap, **length-controlled win rate**, rubric
   anchored to spec/work criteria (not prose polish), and a null-arm sanity check.
3. **Run on tasks with REAL quality variance** — not the saturated closed tasks. This is the binding
   constraint (see below).

## The catch you must hear
On our **saturated** tasks (work-quality pilot: A0 6/6 clean, A1 6/6 clean) both outputs are *correct*, so
"which is better" collapses to style. After length-control + non-Claude judging, the honest expected verdict
is a **tie** — and if anything fablever loses the length it adds. **A properly debiased automated judge will
not rescue the null on saturated tasks; it will confirm it.** The judge only produces a real "better work"
signal on tasks where the outputs genuinely differ in quality. So the automated-judge path still depends on
building tasks with quality headroom (open-ended enough to vary, with an executable correctness floor) —
which is the same unsolved bottleneck, now with a credible measurement instrument waiting for it.

## Demonstration run (non-Claude judge, executed 2026-06-18)
Ran the method on the existing pilot pairs (A0 plain Opus vs A1 fablever), judging the **code artifact**
(not the chat prose — this sidesteps the verbosity trap, since the code diffs are comparable length), with a
**non-Claude GPT judge** (codex MCP), labels randomized P/Q, substance-only rubric.

| task | verdict | substantive reason |
|---|---|---|
| W1-validate | A1 (fablever) | rejects `age:null` as "present" |
| W2-csv | TIE | template-literal vs concat — identical behavior |
| W3-response | TIE | byte-identical |
| W4-money | TIE | byte-identical |
| W5-greet | A0 (plain) | `if (greeting === undefined)` preserves `''`; fablever's `\|\|` defaults it away |
| W6-unique | A0 (plain) | `Set` is O(n); fablever's `includes` is O(n²) |

**Tally: plain Opus 2, fablever 1, 3 ties → no fablever advantage; a slight plain-Opus edge on craft.** The
judge passed its sanity check (tied all three functionally-identical pairs instead of coin-flipping) and gave
verifiable substantive reasons (Set complexity, falsy-greeting semantics) — so this is signal, not position
or verbosity artifact. Caveat: n=6, k=1, single judge, single order; the rigorous version adds full
position-swap, a GPT+Gemini ensemble, and LC win rate. But the direction is clear and consistent with every
other axis: **the automated-judge method does not surface a fablever work-quality advantage either.**

## Concretely runnable next step
Implement the debiased pairwise harness (position-swap + LC win rate + rubric + null-arm) with **GPT (codex
MCP)** as the non-Claude judge. Demonstrate it on the existing pilot pairs as a method check (expect tie =
honest), then point it at a new quality-variance task set. This is automated, non-Claude-judged, and
bias-controlled — the most credible automatic answer obtainable without human raters.

## Sources
- AlpacaEval 2.0 / length-controlled win rate — https://www.emergentmind.com/topics/alpacaeval-2-0
- Cheating Automatic LLM Benchmarks: Null Models Achieve High Win Rates (ICLR 2025) — https://arxiv.org/abs/2410.07137
- Self-Preference Bias in LLM-as-a-Judge — https://arxiv.org/pdf/2410.21819
- Quantifying and Mitigating Self-Preference Bias of LLM Judges — https://arxiv.org/html/2604.22891v2
- Judging the Judges: Systematic Evaluation of Bias Mitigation in LLM-as-a-Judge — https://arxiv.org/html/2604.23178
- Position Bias in LLM Judges: Measurement and Mitigation — https://mbrenndoerfer.com/writing/position-bias-in-llm-judges
- LLM-as-a-Judge practical guides — https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method , https://arize.com/llm-as-a-judge/
