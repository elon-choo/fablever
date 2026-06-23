# Technique A/B — LOCAL-CONTEXT (AGENTS.md) SEEDING (tested independently, not ported)

Does surfacing a module's convention as a local AGENTS.md make the model follow it — and does a specific local seed beat a vague "follow conventions" nudge? Generic idea, our own 9-task A/B. **Harness limit (honest):** headless can't test auto-discovery of the file; it is handed to the model, so this is a LOWER BOUND on seeding's value. Adherence judged by **GPT-5.5 (codex)** oracle, with a transparent regex check alongside.

| adherence | A: no seed (defaults) | B: local seed | C: generic nudge |
|---|---|---|---|
| GPT-5.5 oracle | 11.1% | 77.8% | 22.2% |
| regex check | 33.3% | 77.8% | 33.3% |

## Observed verdict — local seed clearly beats both nothing AND a generic nudge
Adherence (GPT-5.5 oracle): **no seed 11.1% → local seed 77.8% → generic nudge 22.2%**. The specific local convention file (B) carries information a vague "follow conventions" nudge (C) cannot — B is ~3.5× the nudge and ~7.0× the no-seed default. **Verdict: adopt — a present, specific local context file works**, and far better than telling the model to be careful. (Honest lower-bound: the file was handed in; real seeding's extra value — that an agent auto-discovers it near the code — is untested here, so the true effect is ≥ this.) Deterministic regex agreed (33.3/77.8/33.3%). Independent GPT-5.5 oracle; n=9. Validates the *technique*, not any library.