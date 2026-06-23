# Technique A/B — AUTO-GENERATED local seed (closes the local-seed auto-discovery gap)

local-seed proved a HAND-WRITTEN convention file lifts adherence but couldn't test AUTO-generation — what an `/init-deep`-style feature would actually ship. Here a generator (claude) reads an example of the module's existing code and writes the AGENTS.md; the task-runner sees only that generated file. Arm A = no seed; B = hand seed (known ceiling); D = auto seed. Adherence by **GPT-5.5 (codex)** oracle + regex. n=9.

| adherence | A: no seed | B: hand seed | D: AUTO seed |
|---|---|---|---|
| GPT-5.5 oracle | 33.3% | 100% | 88.9% |
| regex check | 33.3% | 77.8% | 100% |

Mean auto-generated AGENTS.md length: 62 words.

## Observed verdict — ADOPT — auto-generation preserves the lift
Auto-generated seed (D) reached **88.9%** vs the hand-written ceiling **100%** (D preserves **89%** of B's level) and the no-seed baseline **33.3%**. **A naive generator that reads existing code carries the convention nearly as well as a hand-authored file** — so the auto-seed feature is viable; the value local-seed measured is reachable automatically. Independent GPT-5.5 oracle; deterministic regex alongside (33.3/77.8/100%). This converts the local-seed result toward a *feature*, not just an observation.