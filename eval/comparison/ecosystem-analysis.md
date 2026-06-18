# What actually makes agents produce better results — ecosystem analysis (2026-06-18)

Goal: make Opus produce *better work*, like Fable. My six experiments proved **style alone doesn't** (it
changes form, not substance). This analyzes what the popular repos do differently, and what fablever should
become.

## The one distinction that explains everything: STYLE vs PROCESS
| | changes | example | does it move objective results? |
|---|---|---|---|
| **STYLE** (what fablever is today) | how the agent *communicates* (terse, outcome-first, prose) + a disposition reminder | fablever; Karpathy-CLAUDE.md behavioral principles (144k★) | **No** — six axes here all parity-or-worse on Opus |
| **PROCESS** (what superpowers is) | what the agent *does* — plan, decompose, write tests first, **run verification**, review, sub-agent | obra/superpowers (41k★); claude-flow (59k★); Agents (37k★) | **Plausibly yes** — it changes the work trajectory, esp. on long tasks |

Tellingly, the Fable *model* strengths the community praises are the PROCESS ones — self-verification ("tested
until flawless"), proactive grounding — not terseness. fablever copied the communication, not the process.

## The concrete techniques that work, ranked by ROI for "better results"
1. **Enforced verification-before-completion (highest ROI).** superpowers' rule: the agent MUST run the
   verification command and read the output before claiming done. This is Fable's real strength and the exact
   gap that made bare fablever break AMB4 (it never checked that it preserved behavior). Cheap to add, large
   effect on correctness/regressions.
2. **Plan-before-code + decomposition.** brainstorming → design spec → 2–5 min tasks with file paths + tests
   written *before* code. Cuts rework/retries (superpowers' claim: "minutes of planning save hours").
3. **TDD enforcement** — tests exist before implementation; the test is the spec and the oracle.
4. **Subagent-driven execution** — isolates each task in its own context to prevent drift on long runs; v6
   consolidated two reviewers into one `task-reviewer` reading the diff once (cheaper, stricter).
5. **Context/token engineering** (efficiency, not quality): file-based handoff of diffs (not pasted into
   context); AGENTS.md modular + progressive disclosure (~70% token cut claimed); CLI ops ~200 tokens vs
   32k–82k for equivalent MCP ops; prompt caching (45–80% cost cut); CLAUDE.md trimming + path-scoped rules.
6. **Model routing + cost guardrails** — cheap model for easy tasks, premium for hard (~60% cost cut);
   superpowers v6 mandates every dispatch declare its model to stop silent escalation; budget circuit breakers.

## The honesty gap in the ecosystem (and fablever's opportunity)
Superpowers v6 claims "~2× faster, ~50% fewer tokens, similar quality" — but **discloses no methodology**: no
sample size, no baseline harness, no metrics; their own note says "these numbers won't hold on every harness."
The Karpathy repo, claude-flow, the "5× from AGENTS.md" posts — almost all are **asserted, not measured**.

This is fablever's real differentiation opportunity: not "another style layer," but **a process layer whose
claims are actually verified** by the rigorous harness already in this repo (executable oracle + behavior
preservation + blind non-Claude judge + length-controlled judging). The ecosystem ships claims; fablever could
ship *measured* claims.

## Recommendation: evolve fablever from STYLE → measured PROCESS
1. **Add a `verification-before-completion` hook/skill** (Stop or pre-finish): require an executable check be
   run and its output read before "done." This is the single highest-ROI change and matches Fable's praised
   strength. (Demo below tests whether it fixes the AMB4 regression style alone caused.)
2. **Add plan-before-code + decomposition** for non-trivial tasks (a lightweight brainstorming/plan skill).
3. **Keep the style layer** — it's harmless and gives a consistent voice — but stop selling it as a results
   improver; the results lever is process.
4. **Measure every process feature** with `eval/comparison/` before claiming a benefit — be the repo whose
   numbers are real.

## Demo: does PROCESS fix what STYLE couldn't? — YES
Bare fablever broke AMB4 ("clean up, preserve behavior") **2/2** by dropping the falsy-guard. Re-run with a
GENERIC verification-before-completion step (fablever + "verify you preserved behavior before finishing", no
hint about the specific guard): **PRESERVED 3/3** (`runs/2026-06-18/verify-demo/`). Cost: ~15–16 turns vs
bare fablever's ~5 — the process is ~3× the work but produces correct behavior. First concrete evidence that
the lever is PROCESS (enforced verification), not style.

Next: measure whether the same verification process beats PLAIN Opus on error-prone tasks (`tasks/error-prone/`).
