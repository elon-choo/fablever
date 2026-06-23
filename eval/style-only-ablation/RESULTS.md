# Style-only ablation — Baseline (B) vs Generic prompt (G) vs fablever style-only (F)

> **Cross-judge check (added later):** the F-vs-B result below was re-judged with **GPT-5.5** to test for Gemini-judge bias (after the real-log replay flipped between judges). It did **not** flip — GPT-5.5 also puts plain slightly ahead (17–26, n.s.) vs Gemini's 4–9. The quality wash is judge-robust. See [`RESULTS-gpt.md`](RESULTS-gpt.md).

48 frozen tasks (6 domains), same base model (claude-opus-4-8). See PROTOCOL.md (committed before the run). Blind forced-choice quality (Gemini-2.5-pro, both orders, order-inconsistent = tie). Acceptance via an INDEPENDENT Gemini oracle (not fablever's gate). Scope-violation is deterministic on the 12 report-only/scope-limited tasks (lower = better). p = exact two-sided binomial; CI = Wilson 95%.

## Blind quality preference
| pair | wins | decided | win-% | p | 95% CI |
|---|---|---|---|---|---|
| F vs B (fablever vs plain) | 4–9 (ties 35) | 13 | 30.8% | 0.2668 | [12.7, 57.6]% |
| F vs G (fablever vs generic prompt) | 11–3 (ties 34) | 14 | 78.6% | 0.0574 | [52.4, 92.4]% |
| G vs B (generic prompt vs plain) | 1–14 (ties 33) | 15 | 6.7% | 0.001 | [1.2, 29.8]% |

## Failure-mode metrics (per arm)
| metric | B (plain) | G (generic) | F (fablever) | direction |
|---|---|---|---|---|
| acceptance-complete (independent oracle) | 85.4% | 87.5% | 79.2% | higher better |
| unsupported "it works" w/o a shown check | 2.1% | 0% | 8.3% | lower better |
| scope violation on report-only/limited tasks | 41.7% | 0% | 0% | lower better |
| mean words (concision / cost proxy) | 365.31 | 268.29 | 350.6 | context-dependent |

**Success criteria (from PROTOCOL):** F-vs-B wants blind ≥60% + acceptance ≥+10pp + lower unsupported + scope≤B. F-vs-G (decisive) wants blind ≥55% OR a clear scope/acceptance edge — if F≈G, the honest read is that fablever isn't magic over a good generic prompt; its value is making that discipline **persistent and automatic** rather than retyped every turn. Single judge model; n=48. Both directions published.

## What this means (honest reading)

Three findings, two of them clean and significant, one a strong trend:

1. **A naive "just tell Claude to be concise/verify" prompt BACKFIRES — significantly.** The generic arm
   lost to plain Claude **1–14** (p=0.001): the instruction over-compresses (268 words vs plain's 365) and
   drops quality. So the most common dismissal of tools like this — *"you could just prompt it yourself"* —
   is **false for the obvious prompt**: that prompt makes things worse.
2. **fablever strongly out-trends that generic prompt (11–3, 78.6% of decided, p=0.057 — just shy of
   significance at n=48).** It is *not* equivalent to a blunt concise/verify instruction. The mechanism:
   fablever holds plain Claude's quality (351 words ≈ 365, F-vs-B is a wash) while the generic prompt
   sacrifices it. (This pair was p=0.049 before five claude-retry-to-empty cells were regenerated; the
   empties had inflated it, so it's reported here as a **trend, not significant**.)
3. **fablever's clean, deterministic win is SCOPE DISCIPLINE.** On the 12 report-only / "change only this"
   tasks, plain Claude violated the stated limit (proposed a fix/edit when told only to report, or expanded
   beyond the ask) **41.7%** of the time; fablever **0%** — matching an *explicit* scope instruction. This
   is fablever's core "don't over-build, do only what's asked" value, measured without a judge.

**And the honest negative:** fablever has the **highest** unsupported-"it works" rate (8.3% vs plain 2.1%) —
its decisive style asserts done/works without always showing the check. A real cost to weigh against the
scope win. (Regex proxy; some are genuinely-verified claims that simply don't show their work.)

**Bottom line:** fablever does **not** beat plain Claude on raw output quality (F-vs-B is a wash, consistent
with the productivity A/Bs). Its demonstrated style-only value is **behavioral**: near-total scope
compliance (0% vs 42%) delivered *persistently and automatically*, while a naive concise/verify prompt —
the thing it's most often accused of just being — measurably backfires. That is the case for the safest
install mode (style-only), and it's the honest one: a discipline layer, not a quality booster.