# Developer-productivity A/B — does fablever make developers more productive?

**Short answer, from two experiments: no measurable gain found — a slight net negative on these
automated proxies.** This directory is the developer-productivity A/B the repo previously listed as an
unmet open item. Both experiments were designed to give fablever its best *fair* shot (tasks in its
mechanism wheelhouse, productivity-framed evaluation, the full style+gate product allowed) and are
published whatever they showed — neither is cherry-picked. Baseline isolation (A0 = genuine plain Opus
despite global fablever) is proven in [`../BASELINE-VALIDATION.md`](../BASELINE-VALIDATION.md).

## Experiment 1 — one-shot preference ([`out/`](out/RESULTS.md))

30 developer tasks (research 12, doc-planning 12, code 6). Plain Opus (A0) vs fablever (A1, both
style-only `A1s` and the real style+gate product `A1g`), same base model. Productivity-framed blind
forced-choice judge (Gemini-2.5-pro, both orders, order-inconsistent = tie): *"which gets YOU to a
shippable result with the least follow-up, back-and-forth, re-reading, rework, and cleanup."*

- **Plain Opus preferred:** style-alone **A1s vs A0 = 1–9** among decided (p = 0.02); full product
  **A1g vs A0 = 1–3** (26 ties, n.s.). No fablever advantage.
- **Mechanism (judge rationales):** a one-shot consumer values exactly the scaffolding fablever strips —
  tables, "next steps", phased checklists, named fallbacks — because it *"saved me a follow-up question."*
- **Where fablever does win objectively (but it didn't convert):** asks-permission/ends-on-question
  **6.7% vs 43.3%** (~6.5× fewer round-trips); first draft acceptance-complete more often (style-only
  63% vs 47%).

## Experiment 2 — multi-turn turns-to-done ([`out2/`](out2/RESULTS.md))

The faithful test of the *interactive* mechanism. 18 tasks, simulated chat sessions to "done", capped at
4 assistant turns. A **neutral, identical developer-policy** reacts to each arm (ends-on-a-question →
"use your judgment, give me the complete result"; incomplete → names the gap; complete + no question →
done). The "complete?" oracle is **Gemini-2.5-pro (a different model), NOT fablever's own gate** — no
home-field advantage. Metric: assistant turns to a shippable result, paired per task.

- **Plain Opus reached done in fewer turns:** **A0 fewer on 7 tasks, fablever fewer on 3** (8 ties;
  p = 0.34, n.s., directionally against fablever).
- **Secondary, all against fablever:** mean turns **A0 1.89 vs A1 2.33**; resolved-within-cap **100% vs
  88.9%**; total words the dev read across the session **1113 vs 1393**.
- **By domain (A1-fewer / A0-fewer / tie):** research **3/2/3** (fablever roughly even — a decisive
  recommendation is the deliverable), doc-planning **0/4/3** (fablever loses — memos expect the
  scaffolding restraint omits), code **0/1/2**.

## Why fablever doesn't win on these proxies (consistent across both)

fablever's restraint produces terser deliverables that an LLM evaluator — a preference judge *or* a
completeness oracle — flags as less complete/actionable, because LLM evaluators reward completeness and
scaffolding. One-shot: the judge prefers plain Opus's thoroughness. Multi-turn: fablever's terse drafts
trigger extra rework turns that outweigh the round-trips it saves by not asking permission.

## What this does and does NOT establish

- **Establishes:** on two automated, favorably-designed productivity proxies, fablever shows **no
  developer-productivity gain** (slight net negative). The repo's standing non-claim — *"no productivity
  magnitude claimed; style transplant, not capability"* — is now backed by a run, not merely conceded.
- **Does NOT establish that fablever hurts real productivity.** Both evaluators are LLMs with a known
  completeness-bias that under-credits decisive brevity; a human developer may weight fablever's
  decisiveness and lower per-turn reading differently. N is modest (30 / 18), single evaluator model per
  experiment. And neither task set simulates fablever's strongest real setting — a long interactive
  *coding* session in Claude Code with many tool calls, where restraint and stop-when-done compound over
  dozens of turns. That experiment is not run here.
- **Honest bottom line:** the developer-productivity claim remains **unproven in fablever's favor —
  measured here and not found.** fablever's demonstrated, *significant* value stays where the evidence
  actually is: the delivery gate's deterministic structural guarantee (27–0 vs the raw draft; clears the
  named acceptance gap 80.6% vs 12.9%), and the interactive-style behaviors — not a productivity-magnitude win.

## Reproduce

```bash
node run-productivity.mjs       # one-shot: gen -> judge -> report  (-> out/)
node run-multiturn.mjs          # multi-turn: run -> report         (-> out2/)
# both need GEMINI_API_KEY; read the runner before running (supply-chain hygiene). Raw per-task
# generations + judgments are committed under out/ and out2/.
```
