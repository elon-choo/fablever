# Doc / planning task set (frozen) — Axis A, DIRECTIONAL-ONLY domain

> **No headline rests on this domain** (protocol §0, m2). There is no executable check, so scoring is a
> rubric (`rubric.md`) applied by the judge panel — which is **non-blind by construction** for a style
> tool. These results are *color*: they illustrate whether the style shift helps on open-ended work, but
> they cannot be a conclusion. Reported in full, win or lose.

Prompts issued **verbatim**; nothing changes between A0 and A1. Each task lists the **rubric anchors** a
strong answer must hit (used by the judge, not an executable check).

| id | prompt (verbatim) | rubric anchors (what a strong answer contains) | contamination note |
|----|-------------------|------------------------------------------------|--------------------|
| **D1-spec** | "Write a one-page spec for a CLI that renames files by a user-supplied pattern. Cover scope, inputs, failure modes, and what's out of scope." | explicit out-of-scope; named failure modes (collisions, perms); no gold-plating | generic prompt, but scored on restraint/structure, not recall of a known doc |
| **D2-migration** | "Plan a migration from a single JSON config file to a per-module config directory. Give the steps, the rollback, and the riskiest step." | ordered steps; concrete rollback; names the riskiest step + why; stops when done | bespoke scenario; no canonical answer to memorize |
| **D3-tradeoff** | "Should we cache the model-list call to disk or in memory? Recommend one and justify in ≤150 words." | a clear recommendation (not a survey); decision-first; bounded length respected | open question; judged on decisiveness + correctness of reasoning |
| **D4-decision** | "We have 3 days before a demo and 6 open bugs. Recommend what to fix and what to cut, with reasoning." | prioritized cut/keep list; reasoning tied to demo risk; no hedging-without-recommendation | situational; scored on outcome-first prioritization |
| **D5-summary** | "Summarize the tradeoff between an on-by-default vs opt-in update checker for a dev tool, then recommend." | both sides stated; one clear recommendation; surfaces the privacy/trust axis | mirrors a real design choice; judged on clarity + a committed recommendation |
| **D6-review-memo** | "A teammate proposes adding 4 npm dependencies to save 30 lines. Write the review memo." | a stance; names supply-chain cost; proportionate (not a lecture); actionable | judged on restraint + a decisive stance, not on length |

**Scoring:** rubric 1–5 per anchor dimension + the §4c pairwise preference, **format-normalized** before
judging (see `rubric.md`). All dimensions reported; **none is a headline.**
