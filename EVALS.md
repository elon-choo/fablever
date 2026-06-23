# EVALS — what was tested, what wasn't, and which install mode the evidence supports

fablever is positioned as a **style/structure transplant, not a capability upgrade**. So the evals here
don't try to show "Claude got smarter" — they test **whether specific failure modes go down** and
**whether the install is safe and private**. This page is the index; each row links to raw data you can
recompute offline. Everything is published, including the results that went against the project.

## Evidence by install mode (what each mode has actually been tested for)

| install mode | what it adds | evidence | recommended for |
|---|---|---|---|
| **style-only** (`--no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp`) | the always-on output style, nothing else | style-only ablation vs plain + vs a generic prompt → [`eval/style-only-ablation/`](eval/style-only-ablation/); also **100% complete** on 20 multi-step tasks → [`eval/multistep-gate/`](eval/multistep-gate/) | **first-time users** — lowest install surface, safest |
| **default** (style + hooks + MCP) | SubagentStart + SessionStart hooks + the `fable_check` gate / taste store (MCP) | gate validation (27–0 vs raw draft) → [`eval/comparison/fable-check-sim/`](eval/comparison/fable-check-sim/); install-safety + privacy proven by test (below). Honest limits: the gate adds **no** multi-step completeness over style-only → [`eval/multistep-gate/`](eval/multistep-gate/), and the style costs **~14%/call** (amortizing) → [`eval/cost-latency/`](eval/cost-latency/) | users who want the delivery gate and subagent reach |
| **+ xverify** (`--with-xverify=…`) | a different-lab model (GPT/Gemini) cross-checks the review | defect-catch ULTRA eval (16/18 @ 0.74 precision) → [`eval/ultra/`](eval/ultra/). Honest limit: on enumerable defects a strong single model is already at ceiling — cross-model added **0** recall → [`eval/xverify-value/`](eval/xverify-value/); its value (untested) is judgment/design review | **high-stakes review only** (opt-in, costs a key) |
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
| **Cost & latency** | does the style cost more tokens / time? | **Costs ~14%/call more** (a measured ~2.3k-token style block; output length ~neutral, latency identical). One-time, cache-amortized → worst-case figure. A *published* cost negative. | [`eval/cost-latency/`](eval/cost-latency/) |
| **Cross-model (xverify) value** | does a 2nd-lab reviewer catch defects one model misses? | **NO — single Opus caught 34/34 planted defects** (incl. subtle: DST, ReDoS, float-money); cross-model & a 2nd Claude pass each added **0** recall, only more noise. Grader validated. | [`eval/xverify-value/`](eval/xverify-value/) |
| **Multi-step gate value** | does the default-install gate beat style-only on multi-part tasks? | **NO — both 100%** complete on 20 tasks / 75 checkpoints; gate closed **0** gaps (style-only already complete). Oracle validated by negative control. | [`eval/multistep-gate/`](eval/multistep-gate/) |
| **Real-log replay** | on the operator's OWN real prompts, does fablever win? | **JUDGE-DEPENDENT (important).** Same Opus replies, two judges: **Gemini prefers plain 8–2** (n.s.), but **GPT-5.5 prefers fablever 14–3** (p=0.013). The one-shot preference *flips on judge choice* — so it is **not** a robust fablever negative, and the Gemini-only number understated it. Raw stays private. | [`eval/real-log-replay/`](eval/real-log-replay/) |

## Technique A/Bs — generic ideas, independently tested (not library ports)

Three well-known engineering techniques (seen in popular harnesses, but **re-implemented and A/B-tested on
their own merits here** — judged by **GPT-5.5 via the Codex CLI**, a different lab from the Opus generator):

| technique tested | result | verdict |
|---|---|---|
| **Plan-first artifact** (plan before executing) | on hard 5-part tasks, plan-then-execute beat direct **9–1** (90%, **p=0.022**) | **ADOPT** for hard multi-step work |
| **Local-context seeding** (convention in a local `AGENTS.md`) | adherence: no-seed **11%** → local-seed **78%** → generic "follow conventions" nudge **22%** | **ADOPT** — a specific local file beats a vague nudge |
| **↳ Auto-generated seed** (generator reads the code, writes the `AGENTS.md`) | adherence: no-seed 33% → auto-seed **88.9%** → hand-written 100% (regex: auto **100%** vs hand 78%) | **ADOPT** — auto-generation preserves the lift; closes the auto-discovery gap → shippable feature |
| **Evidence loop** (no "done" without a shown check) | as a **2nd rewrite pass**: hit the metric but GPT-5.5 preferred the leaner baseline **12–4** (length 217→384). **Refined (inline, 1st-pass):** unsupported→**0%**, length *halved* 224→117, beats baseline **15–2** (p=0.0023) & the original loop **17–0**; pooled vs baseline **26–6 (p=0.0005)** | **ADOPT the inline packaging, NOT a 2nd pass** — the discipline belongs in the first generation |

Full writeup + provenance note: [`eval/technique-ab/`](eval/technique-ab/). These validate *the ideas*; wiring
any of them into the install is a separate gated change.

**Upgrade research (community-praised harnesses + a sibling project).** A mechanism + social-listening study
of the tools people actually rally behind (lazycodex/oho, insane-search, slides-grab, `fivetaku/fablize`) →
[`eval/technique-ab/RESEARCH-upgrade-points.md`](eval/technique-ab/RESEARCH-upgrade-points.md). Key
independent corroboration: **fablize** attacks fablever's *exact* thesis and reached the same split (procedure
transfers, capability doesn't) via 19 A/B + 26 sessions — and its `MEASUREMENT_PROTOCOL.md` names the one
thing fablever hasn't measured (the "harness paradox": does always-on verification *cost* long-session
attention?). Prioritized, evidence-screened candidates: **task-type routing**, **auto-generated local seed**,
and **out-of-band holdout measurement** — each gated behind its own A/B, two of which are now running
(`run-surgical-evidence.mjs`, `run-autoseed.mjs`).

## What was NOT tested (open, not hidden)

- **A long interactive *coding* session** (many tool calls + subagents over a session) — fablever's
  strongest real setting, and the one **none** of the single-turn evals above simulate (the real-log
  replay is single-shot by construction). The deliverable-style tasks favor the scaffolding fablever
  strips, so every productivity/quality null here bounds the claim **downward**, not upward.
- **Real-user productivity** (multiple human participants, real sessions) — genuinely needs people; not
  run, and not fakeable. The real-log replay is the closest *solo* proxy and it is single-turn.

## How to reproduce

Offline, no keys: `node eval/ultra/score.mjs`, `node test/install-matrix.mjs`, `node test/privacy-canary/run.mjs`,
`cat eval/comparison/fable-check-sim/out4/RESULTS.md`, and any `eval/*/RESULTS.md`. The generation/judging
A/Bs (`eval/comparison/productivity-ab/`, `eval/style-only-ablation/`, `eval/xverify-value/`,
`eval/multistep-gate/`, `eval/real-log-replay/`) need your own `GEMINI_API_KEY` and a local `claude`, and
`eval/cost-latency/` needs only a local `claude` — read the runner before running (supply-chain hygiene).
Every raw generation and judgment is committed (the real-log replay commits aggregates only — raw prompts
never leave the machine). The two oracles that returned suspiciously clean results ship with their
validation: `eval/multistep-gate/` has a negative control proving the completeness oracle catches a
deliberately-incomplete reply, and `eval/xverify-value/`'s grader is shown discriminating (it marks the
weaker reviewer's misses).

## The honest one-paragraph summary

fablever does **not** make Claude smarter or cheaper — and we have the runs to say so, not just caution.
Measured: it **costs ~14%/call** (a style-block overhead that amortizes); on enumerable **defect-catch** a
strong single model is already at ceiling, so **cross-model verification adds 0 recall**; on **multi-step**
tasks style-only is already 100% complete, so the **gate adds nothing** there. **The judge matters — and we
checked, both ways:** the forced-choice *quality* judgments used a single Gemini judge, so we re-judged with
**GPT-5.5**. On the **real-log replay** the result **flipped** (Gemini: plain 8–2 → GPT-5.5: fablever 14–3,
p=0.013) — so the one-shot "fablever doesn't win" read on *real, messy* prompts is **judge-dependent**. But
on the **flagship style-only ablation** the same cross-judge check did **NOT** flip (Gemini 4–9, GPT-5.5
17–26 — plain slightly ahead under both, n.s.): on clean synthetic tasks fablever's quality wash is
**judge-robust**. So the honest line is precise: a non-Anthropic judge prefers fablever on real prompts, but
fablever still does **not** beat plain on raw quality. What fablever has *robust*
(judge-independent, deterministic) evidence for stays narrow and behavioral: a delivery gate that beats
shipping the **unchecked first draft** (27–0), near-total **scope discipline** (0% vs plain's 42%
violations) that a naive "be concise" prompt *fails* to deliver (it backfires 1–14), and an install that is
**safe** (uninstall = no-op, 140/140) and **private** (one anonymous ping, 16/16). Recommend **style-only**
to start; add the gate only for the unchecked-claim / external-delivery case; reserve cross-model
verification for high-stakes *judgment* review, not defect-catch.
