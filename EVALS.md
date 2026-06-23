# EVALS — what was tested, what wasn't, and which install mode the evidence supports

fablever is positioned as a **style/structure transplant, not a capability upgrade**. So the evals here
don't try to show "Claude got smarter" — they test **whether specific failure modes go down** and
**whether the install is safe and private**. This page is the index; each row links to raw data you can
recompute offline. Everything is published, including the results that went against the project.

## Evidence by install mode (what each mode has actually been tested for)

| install mode | what it adds | evidence | recommended for |
|---|---|---|---|
| **style-only** (`--no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp`) | the always-on output style, nothing else | style-only ablation vs plain + vs a generic prompt → [`eval/style-only-ablation/`](eval/style-only-ablation/) | **first-time users** — lowest install surface, safest |
| **default** (style + hooks + MCP) | SubagentStart + SessionStart hooks + the `fable_check` gate / taste store (MCP) | gate validation (27–0 vs raw draft) → [`eval/comparison/fable-check-sim/`](eval/comparison/fable-check-sim/); install-safety + privacy proven by test (below) | users who want the delivery gate and subagent reach |
| **+ xverify** (`--with-xverify=…`) | a different-lab model (GPT/Gemini) cross-checks the review | defect-catch ULTRA eval (16/18 @ 0.74 precision) → [`eval/ultra/`](eval/ultra/) | **high-stakes review only** (opt-in, costs a key) |
| **+ fusion** (`--with-fusion`) | multi-model panel deliberation | protocol + error-path tests only → [`fusion/`](fusion/) | advanced/experimental users |

## What was tested — and the honest result

| eval | question | result | where |
|---|---|---|---|
| **Delivery gate** (`fable_check`) | does the gate beat shipping the raw draft? | **YES — 27–0**, p≈1.5×10⁻⁸; clears named gaps 80.6% vs 12.9%. No edge over a *generic* 2nd pass (16–9, n.s.). | [`eval/comparison/fable-check-sim/out4/`](eval/comparison/fable-check-sim/out4/RESULTS.md) |
| **Developer productivity** (one-shot + multi-turn) | does fablever make a developer more productive? | **NO measurable gain** (slight net negative). A *published* null/negative. | [`eval/comparison/productivity-ab/`](eval/comparison/productivity-ab/) |
| **Style-only ablation** | is fablever-style better than plain Claude, and than a generic "be concise/verify" prompt? | **Quality: ties plain (4–9, n.s.); beats the generic prompt (11–3, p=0.057 trend) — and that naive prompt BACKFIRES vs plain (1–14, p=0.001). Clean win: scope discipline 0% vs plain's 42% violations. Honest cost: more unsupported "it works" (8.3% vs 2.1%).** | [`eval/style-only-ablation/RESULTS.md`](eval/style-only-ablation/RESULTS.md) |
| **Install safety matrix** | does installing/uninstalling mangle my `~/.claude` settings? | **NO — 140/140**; uninstall restores settings deep-equal to original across 10 fixtures. | [`test/install-matrix.mjs`](test/install-matrix.mjs) |
| **Privacy canary** | does the default install leak secrets or code? | **NO — 16/16**; whole network footprint is one anonymous `git ls-remote HEAD`. | [`test/privacy-canary/run.mjs`](test/privacy-canary/run.mjs) |
| **Orchestration ULTRA** (defect-catch) | does cost-no-object cross-model review catch more planted defects? | **16/18 @ 0.74 precision** on an n=6 fixture (not a productivity number). | [`eval/ultra/`](eval/ultra/) |

## What was NOT tested (open, not hidden)

- **A long interactive *coding* session** (many tool calls over a session) — fablever's strongest real
  setting, and the one the productivity A/Bs above do **not** simulate. The deliverable-style tasks they
  use favor the scaffolding fablever strips, so they bound the productivity claim downward, not upward.
- **Full-install ablation on multi-step/subagent tasks** — whether the hooks/MCP add value over
  style-only on hard, multi-agent work (the single-shot tasks here don't exercise that).
- **Real-user productivity** — needs participants; not run. The evals here are solo-reproducible proxies.
- **Token/wall-clock cost-direction** — needs call-site instrumentation the Workflow runtime can't provide.

## How to reproduce

Offline, no keys: `node eval/ultra/score.mjs`, `node test/install-matrix.mjs`, `node test/privacy-canary/run.mjs`,
`cat eval/comparison/fable-check-sim/out4/RESULTS.md`. The generation/judging A/Bs (`eval/comparison/productivity-ab/`,
`eval/style-only-ablation/`) need your own `GEMINI_API_KEY` and a local `claude` — read the runner before
running (supply-chain hygiene). Every raw generation and judgment is committed.

## The honest one-paragraph summary

fablever does **not** claim to make Claude smarter or developers faster — and where productivity was
measured, no gain was found, which is published. What it *does* have evidence for: a delivery gate that
reliably beats shipping the unchecked first draft (27–0), an install that is **safe** (uninstall = no-op
on your settings, 140/140) and **private** (one anonymous version-check ping, 16/16), and a style layer
whose failure-mode behavior is measured in the ablation. Recommend **style-only** to start; add the gate
(default) if you want it; reserve cross-model verification for high-stakes review.
