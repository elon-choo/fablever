# Can we build a version that beats plain Opus? — the honest answer (2026-06-18)

Goal: an open-source version that is *measurably more productive than vanilla Opus*. After many build→test
iterations, here is the grounded conclusion.

## On auto-oracle-able single-file tasks, plain Opus has NO headroom — it's already at the ceiling
| task class | plain Opus result |
|---|---|
| coding (easy, 9) | 27/27 |
| coding (hard textbook, 9) | 27/27 real solves |
| work-quality (6 maintenance) | 6/6 clean |
| error-prone (6 boundary/state traps) | 18/18 |
| compound (3 interacting changes) | 5/5 |
| compound (8 requirements) | 5/5 |

**Six classes, ~100%.** You cannot beat 100%. No layer — style or process — can show a *quality* win where
the base model never fails. Every "fablever vs plain" axis (incl. the automated non-Claude judge and the
ambiguous-intent test) came back parity-or-against fablever for the same reason.

## What we DID prove
- **Process > style.** Bare fablever broke a "preserve behavior" task 2/2; the same model + a
  verification-before-completion step preserved it 3/3 (`runs/2026-06-18/verify-demo/`). Enforced
  verification is the real lever — but it only helps when the base model *fails*, which on short tasks it
  doesn't.
- **The Fable strengths the community praises are PROCESS** (self-verification, grounding), which fablever
  never transplanted (it copied communication style). Superpowers (41k★) and peers win by transplanting
  *process*, not style.

## Why a single-task harness structurally cannot show a win
Superpowers' headline claim — "~2× faster, ~50% fewer tokens, same quality" — is an **efficiency/cost win on
LONG, MULTI-FILE, MULTI-TASK workflows**, from (a) anti-drift (subagent context isolation) and (b)
token/context engineering (file-based diff handoff, one reviewer, no re-pasting). A short single-file task
has **no redundant context to trim and no drift to prevent**, so neither lever can fire. On short tasks the
process layer only *adds* tokens/turns (we measured fablever and verify both costing MORE). So:
- **Quality win:** impossible on short tasks (base is saturated).
- **Efficiency win:** impossible on short tasks (no context overhead to remove).

Both live exclusively in the long-horizon regime.

## What would ACTUALLY beat plain Opus — and how to prove it
Target the regime where plain Opus genuinely degrades: **long, multi-file, multi-step projects** (a feature
across several files; a refactor touching a whole module; a multi-hour agentic build). There, plain Opus
drifts, rebuilds context, and ships rework. A process layer (plan → decompose → subagent-isolated tasks →
verify-each → file handoff) plausibly wins on:
- **rework rate** (tasks that pass review first time vs need retries),
- **tokens & wall-clock to a correct, review-passing result** (superpowers' actual claim),
- **completion of all requirements without drift.**

The experiment that would settle it (and that fablever could *measure* honestly, unlike the ecosystem's
unverified claims):
1. A small set of **real multi-file project tasks** (3–6 files, 5–15 min of agent work each) with an
   **executable acceptance suite** as the oracle.
2. Arms: **plain Opus** vs **Opus + a superpowers-style process layer** (plan + verify-before-done +
   subagent decomposition).
3. Metrics: first-pass acceptance rate, total tokens, wall-clock, # of correction rounds.
4. If the process layer reaches the same acceptance with fewer tokens/rounds — or higher acceptance — that
   is a real, measured "more productive than plain Opus."

**This is a different, larger harness** (real repos, long agentic runs, token+time+rework instrumentation) —
expensive to build and run, but it is the only regime where the win is real. Single-file iteration is a
proven dead end and was stopped here on definitive evidence (six saturated classes).

## The long-horizon test was built and run — process still does not beat plain Opus
Built a multi-file integration task (MF1: a mini web framework, router+middleware+app, with cross-file
requirements — route params, middleware ordering + short-circuit, method-aware 404 — and a strict HIDDEN
acceptance suite). This is real long-horizon work: plain Opus took **17 turns / $0.89 / ~3 min** per run.

| arm | acceptance | turns | cost | wall-clock |
|---|---|---|---|---|
| plain Opus | **5/5 (100%)** | 17.2 | $0.89 | ~180s |
| + process (plan → implement → write own tests → verify) | 3/3 (100%) | 25 | **$1.50** | ~340s |

**Plain Opus is 100% even here (7th saturated class), and it already self-verifies autonomously** (those 17
turns include running node and self-correcting). The explicit process layer reached the SAME 100% for **~70%
more cost** — strictly worse. Process can't win on quality (no failures to fix) and can't win on efficiency
(Opus already verifies efficiently; the process only adds overhead).

## Definitive bottom line
Across the whole investigation — style (fablever) and process (plan/verify), single-file and multi-file,
seven task classes, plus an automated non-Claude judge — **nothing beats plain Opus 4.8 on any task that can
be automatically built and oracled.** It sits at the quality ceiling AND self-verifies efficiently, so a
layer can only add cost. (This also corrects a misread: superpowers' "2× / 50%" is v6-vs-v5, its OWN
optimization — not superpowers-vs-plain. Structured process trades *more* cost for *reliability*, and only
pays off where the base model is UNRELIABLE — which Opus 4.8 is not, everywhere measured here.)

fablever's honest, evidence-backed value is **no-harm + a consistent working/communication style** — NOT a
productivity improvement over plain Opus. A genuine productivity win would require a regime beyond cheap
measurement (massive multi-hour real projects), and even there the corrected evidence says the gain would be
reliability-at-higher-cost, not a free productivity uplift. The relentless search is complete and the answer
is, honestly, negative.
