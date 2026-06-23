# Evidence & Credibility — how to evaluate fablever (read this first)

**This file is a verification map — what each claim is, what is deliberately *not* claimed, and
the exact file to check for each.** Verify, don't trust. fablever's credibility does not rest on
adjectives. It rests on three things you can check yourself in minutes:

1. It makes **bounded** claims and names what it does *not* claim.
2. It ships a **reproducible evaluation** and discloses results **including the ones that
   went against it**.
3. It **concedes its limitations in writing**, in the same repo, unprompted.

A tool that hides its limits is less trustworthy than one that lists them. This file maps
each strength to the artifact that proves it, and is explicit about the boundaries. Treat
every row below as "go read this file and decide for yourself," not "take our word."

> **Honesty contract (binding, repo-wide).** Scaffolding is a multiplier on base competence,
> never a substitute. This is a **style** transplant, not a capability transplant. No
> developer-productivity magnitude is claimed. Where the evidence went against the project,
> it is published anyway. If any statement in this repo overclaims, that is a bug — open an
> issue and it will be conceded, fixed, or rebutted.

---

## 1 · What this project does NOT claim (the trust signal that matters most)

Most "make your model behave like \<X\>" packs lead with superlatives. This one leads with
its ceiling. These non-claims are load-bearing and stated throughout the repo:

- **No productivity-magnitude claim — measured, and the one-shot judgments proved judge-dependent.**
  "Improves productivity by N%" is *not* asserted (T2 demoted). We ran the A/Bs: one-shot + multi-turn
  productivity (no gain). The real-prompt replay first showed plain preferred **8–2 under a Gemini judge** —
  but re-judging the **same** replies with **GPT-5.5 flipped it to fablever 14–3 (p=0.013)**. So that
  one-shot "no win" was the judge's taste, not a robust property; both judges are published, and the same
  cross-judge check is owed to every other single-Gemini-judged forced-choice eval here. Verify:
  [`eval/real-log-replay/`](eval/real-log-replay/) (`results.json` = Gemini, `results-gpt.json` = GPT-5.5),
  [`eval/comparison/productivity-ab/`](eval/comparison/productivity-ab/).
- **Measured against its own upsells — and they didn't help.** We tested the features that would
  *sell* this and published the nulls: the style **costs ~14%/call** (not a token-saver), **cross-model
  xverify added 0 defect recall** over a single strong model already at ceiling, and the default-install
  **gate closed 0 multi-step gaps** style-only didn't already cover. Both clean-looking oracles ship with
  validation. Verify: [`EVALS.md`](EVALS.md), [`eval/cost-latency/`](eval/cost-latency/),
  [`eval/xverify-value/`](eval/xverify-value/), [`eval/multistep-gate/`](eval/multistep-gate/).
- **Not a capability upgrade.** It cannot raise a weaker model's reasoning ceiling. It
  changes working *style* and collaboration *structure*. Verify: README's "What this is and
  isn't" box and [`whitepaper/01-what-this-is.md`](whitepaper/01-what-this-is.md) §1.1.
- **Not "parallel beats solo."** Its own controlled A/B *refutes* the naïve "more agents win"
  story. Verify: [`whitepaper/03-results.md`](whitepaper/03-results.md) §3.2.
- **Not "criticism-proof."** The aspirational "publishable without valid criticism" bar (T1)
  was **demoted** to a process, not a guarantee. Verify: `docs/PUBLICATION-READINESS.md`.

These non-claims sit at the top of this file, before any strength, and are stated throughout the
repo — so you can check them against the prose rather than take this file's word for it.

---

## 2 · The grounded strengths — and where to verify each

| Strength | What's actually true | Verify in |
|----------|----------------------|-----------|
| **The delivery gate is proven, statistically** | On a 60-task powered run, the gate-guided revision beats shipping the raw first draft **27–0** (p≈1.5×10⁻⁸, 95% CI [87.5,100]%); objectively it clears the *named* acceptance gap on **80.6%** of blocked tasks vs **12.9%** for a generic pass. The quality-ceiling boundary is conceded in the same file (T-vs-P 16–9, n.s.). | `eval/comparison/fable-check-sim/out4/RESULTS.md` (raw judgments in `out4/judge/`, runner `run-mega.mjs`) |
| **It is measured, not asserted** | Ships a pre-registered, stratified, model-swap, condition-blind eval harness — and the *results*, including a **null/negative** one it discloses. | `eval/ab-harness.mjs`, `eval/results-2026-06-15.md`, `eval/results-2026-06-15-hard.md` |
| **The eval has controls** | 4 arms (baseline, prompt-matched, draw-matched, panel) that isolate structure from lens-taxonomy and draw-count confounds. Few "agent" tools control for these at all. | `eval/ab-harness.mjs`, `whitepaper/02-methodology.md` §2.2 |
| **A best-case result, robustly judged** | On the latest models (GPT-5.5 + Gemini-3.1-pro-preview) the cost-no-object pipeline caught **16/18** planted defects at the **highest precision of any config (0.74)** under a **5-judge cross-model panel (4 GPT + 1 Gemini)**; the prior-model run peaked at **18/18** recall. Each number is labelled with the models that produced it, and the scripts + raw data are committed. | `whitepaper/03-results.md` §3.3, `eval/ultra/` |
| **Orchestration is executed code, not prose** | Real `parallel()` barriers, schema-forced output, JS-owned gates — with live runtime tests, not "behave like X" text. | `orchestration/recipes/*.mjs`, `test/orchestration-runtime-test.js` |
| **Cross-model decorrelation** | An off-by-default arm adds a different-weights reviewer (GPT/Gemini) to catch a class a same-family panel structurally can't. Zero overhead when off. | `fusion/fusion-server.js`, `whitepaper/01-what-this-is.md` §1.4 |
| **Zero dependencies, supply-chain clean** | No npm deps, no `postinstall`/`prepare` scripts. **The default install reads zero credentials and sends no code/content anywhere**; its only network call is an anonymous once/24h version check (`git ls-remote`, reads just the public HEAD sha; `FABLE_UPDATE_CHECK=off`). Every key/content path (Fusion, xverify, model-freshness refresh) is opt-in and off by default. | `package.json`, `fusion/fusion-server.js`, `claude-code/hooks/fable-update-check.js`, `orchestration/lib/update-check.mjs` |
| **Fail-safe, reversible** | Hooks fall open on error; `FABLE_PROFILE=off` disables; `install.sh --uninstall` restores prior settings deterministically. | `install.sh`, `claude-code/hooks/fable-subagent.js`, `claude-code/lib/mcp-remove.js` |
| **Install safety & privacy — proven by test** | Install/uninstall across **10 synthetic settings fixtures** asserts uninstall restores `settings.json` deep-equal to the original (140 checks). A **privacy canary** (planted fake keys + secret file, `git`/`curl` shimmed) proves the default's whole network footprint is one anonymous `git ls-remote HEAD` — no key/code/canary leaks (16 checks). Both in a throwaway HOME, both in `npm test`. | `test/install-matrix.mjs`, `test/privacy-canary/run.mjs` |
| **Adversarially reviewed, on the record** | 3 rounds × (Claude expert personas + GPT + Gemini) consensus, **with the attacks that failed recorded too**. | `docs/PUBLICATION-READINESS.md` |
| **Provenance** | Distilled from Anthropic's *published* Fable prompting guidance (not reverse-engineered, not leaked content). | `docs/RESEARCH.md`, `NOTICE` |
| **Transparent experiment trail** | The full dated experiment log is published — including the runs that **failed or went against the project** (the saturated-fixture loss, the escalation that backfired). | [`whitepaper/08-experiment-log.md`](whitepaper/08-experiment-log.md) |

### 2.1 · The delivery gate (`fable_check`) — the freshest and most direct evidence of a real improvement

This is the single result to check if you want "does it improve the actual work, with numbers." The
`fable_check` tool is a deterministic acceptance gate: before a deliverable is handed over, it tests the
draft against a per-domain Definition-of-Done and **BLOCKs** when a required acceptance criterion is
missing — naming the specific gap. To measure whether that helps, a 60-task battery was generated in the
Fable style; each blocked draft was revised three ways and judged **blind, forced-choice, both orders**
(order-inconsistent = position-bias tie) by Gemini-2.5-pro, scored with an **exact two-sided binomial
sign test** and **Wilson 95% CIs**:

- **Proven:** gate-guided revision **T** vs the raw first draft **C** → **27–0** (4 ties), p ≈ 1.5×10⁻⁸,
  95% CI **[87.5, 100]%**. Shipping the raw draft loses essentially every time.
- **Objective, no judge:** the gate-guided revision cleared the *named* acceptance gap on **80.6%** of
  blocked tasks; a generic "make it excellent" pass cleared it on **12.9%**.
- **Conceded boundary (same run):** **T** vs a *generic* second pass **P** → **16–9** (6 ties), p = 0.23
  — **not significant.** The gate does not raise the quality *ceiling* over any second revision; its
  proven value is the deterministic structural guarantee, not a higher ceiling. This null is reported
  next to the win, not buried.

Verify: read [`eval/comparison/fable-check-sim/out4/RESULTS.md`](eval/comparison/fable-check-sim/out4/RESULTS.md)
(every raw per-task judgment is committed under `out4/judge/`; runner `run-mega.mjs`). The gate logic is
`mcp/src/server.js` → `fableCheck()`, covered by `node test/mcp-test.js` (48 checks). Earlier, smaller
replications (pilot 7–0; cross-model agreement check) are kept under the same directory's `out/`–`out3/`.

---

## 3 · How it addresses the common failure modes of "act-like-Fable" wrappers

This compares fablever against the **typical pattern** of Fable-style prompt packs as a
*category* — these are well-known failure modes, **not** an audit of any specific named
project. Each contrast is grounded in an artifact above; read it and judge.

| Common wrapper failure mode | fablever's position | Grounded? |
|-----------------------------|---------------------|-----------|
| **Ships zero measurement** ("it just works") | Ships an eval that can *falsify* it, ran it, and published even the result that hurt (panel = pure cost on easy tasks). | ✅ `eval/` + results docs |
| **Overclaims** ("10× productivity") | Explicitly demotes the productivity claim; states "style not capability." | ✅ `whitepaper/05`, `docs/PUBLICATION-READINESS.md` |
| **Prose placebo** — "act like Fable" text that can't change orchestration | Separates the style layer from an **executed** Workflow-control-flow layer, with runtime tests — and honestly notes the A/B can't yet fully isolate that factor. | ✅ `orchestration/`, `test/` (+ conceded confound in `whitepaper/02`) |
| **Single-family review blind spot** | Optional cross-model verification by a different-weights model. | ✅ `fusion/fusion-server.js` |
| **Heavy deps / install-time scripts** (supply-chain risk) | Zero dependencies; no postinstall/prepare. | ✅ `package.json` |
| **Irreversible / opaque install** | Toggleable + deterministic, settings-restoring uninstall. | ✅ `install.sh` |
| **No conceded limits** | A standing, public limitations list that an evaluator is invited to extend. | ✅ `whitepaper/06-limitations.md` |

The through-line: **fablever is differentiated not by a bigger claim but by what it ships — the
falsification test, the run, and the published limits.** Check each against the artifacts above and
weigh it yourself.

---

## 4 · The limitations we concede (so you don't have to find them)

Full list: [`whitepaper/06-limitations.md`](whitepaper/06-limitations.md). The load-bearing ones:

- The headline (latest models: **16/18**; prior-model peak: **18/18**) is a **defect-catch**
  result on a **small (n=6), author-planted** fixture with a **single generation run** —
  robustly *judged*, not a productivity number. "Newest" did not raise recall here.
- Precision (latest **0.74**, prior **0.63**) is a **floor** set by a 3-defects-per-task
  answer key, not a measured hallucination rate (an adversarial refute pass dropped ~nothing —
  the extra findings are real defects, not noise).
- The orchestration recall gain is **lens-taxonomy + draw-count**, not "parallel structure";
  the panel's structural win is precision, and on easy tasks it is pure cost.
- **Open items, not hidden:** token/wall-clock **cost-direction has now been measured**
  (`eval/cost-latency/`, ~14%/call, amortizing) and a developer-facing productivity A/B **has now
  been run** (one-shot + multi-turn) and found **no gain** — published nulls, see
  [`eval/comparison/productivity-ab/`](eval/comparison/productivity-ab/) and
  [`eval/real-log-replay/`](eval/real-log-replay/). Still genuinely not run: a **multi-participant
  human study** and a **long interactive coding session** (multi-turn + subagents) — the single-turn
  evals here do not simulate it. The repo's "style not capability, no magnitude claimed" position is
  now backed by runs, not just conceded; index in [`EVALS.md`](EVALS.md).

If you found a weakness not listed here, that is a contribution — it belongs in an issue, and
under this repo's own rules it becomes a blocker until conceded, fixed, or rebutted.

---

## 5 · Reproduce everything (don't trust — run)

Step-by-step commands: [`whitepaper/07-reproduce.md`](whitepaper/07-reproduce.md).

- **Offline, no keys:** `node eval/ultra/score.mjs` recomputes the candidate/confirmed counts
  behind the headline straight from committed raw data ([`eval/ultra/raw/`](eval/ultra/raw/)).
- **The delivery-gate result (§2.1), offline:** `cat eval/comparison/fable-check-sim/out4/RESULTS.md`
  reads the 27–0 / 80.6%-vs-12.9% tally; the raw per-task judgments it was computed from are committed
  alongside in `out4/judge/`. The gate itself is exercised by `node test/mcp-test.js` (48 checks).
- Tests: `npm test` (orchestration contract + runtime smoke + MCP + fusion + install lifecycle).
- The Claude-only A/B (`eval/ab-harness.mjs`) is a **Workflow-tool module**, not a bare-`node`
  script; its recorded output is committed at `eval/results-2026-06-15*.md`.
- The cross-model ULTRA pipeline — scripts **and** the raw JSON they produced — is committed in
  [`eval/ultra/`](eval/ultra/); only the live judge step needs your own API keys (read the scripts
  before running — supply-chain hygiene).

---

## 6 · The fastest credibility check (for a time-boxed reviewer)

1. Read §1 here — does it concede non-claims? (yes)
2. Open `eval/results-2026-06-15.md` — does it report a result **against** the project? (yes — panel = 5× cost on the saturated fixture)
3. Open `whitepaper/06-limitations.md` — is the limitations list specific and self-incriminating? (yes)
4. Check `package.json` — dependency count. (zero)
5. Skim `docs/PUBLICATION-READINESS.md` — are the failed attacks recorded alongside the successful fixes? (yes)

A project that passes all five is, by construction, hard to accuse of overclaiming. Decide from
the five checks, not from this sentence.

---

*Not affiliated with Anthropic. Claude, Anthropic, and Fable are Anthropic trademarks, used
nominatively to describe what this independent community tool works with. See [`NOTICE`](NOTICE).
Provenance and full claims ledger: [`docs/PUBLICATION-READINESS.md`](docs/PUBLICATION-READINESS.md).*
