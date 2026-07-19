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
  but re-judging the **same** replies with **GPT-5.5 flipped it to fablever 14–3 (p=0.013)** — so on *real,
  messy* prompts the one-shot "no win" was the judge's taste. We then ran the same cross-judge check on the
  flagship **style-only ablation**, and there it did **NOT** flip (Gemini 4–9, GPT-5.5 17–26 — plain
  slightly ahead under both, n.s.): on clean synthetic tasks fablever's quality wash is judge-robust. Honest
  net: a non-Anthropic judge prefers fablever on real prompts, but fablever still does not beat plain on raw
  quality. Verify: [`eval/real-log-replay/`](eval/real-log-replay/) (`results.json`=Gemini,
  `results-gpt.json`=GPT-5.5), [`eval/style-only-ablation/RESULTS-gpt.md`](eval/style-only-ablation/RESULTS-gpt.md).
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
| **Guards its own self-negating result, in-tool** | The style-only ablation's one honest negative — fablever asserting "it works" with no shown check (8.3% vs plain 2.1%) — is now caught by the tool. `fable_lint`'s `unsupported-done-claim` rule (EN+KO) flags, at high severity, a completion claim that shows neither inline evidence (`command`/file:line/test/"passes") nor a "not verified" marker, and is regression-guarded at **100% accuracy (TP7/TN11/FP0/FN0)** on a labeled fixture (lexical-proxy limits published). Role split: `fable_lint` = message-wording discipline, `fable_check` = deliverable acceptance gate. | `eval/unsupported-claim-regression/RESULTS.md`, `mcp/src/server.js`→`fableLint()`, `node test/mcp-test.js` (56 checks) |
| **Codex CLI native support — reversible, no token reads (proven by test)** | Codex has no Claude-Code output-style surface, so the same discipline installs via `AGENTS.md` (+ hooks + MCP). Everything is marker-based and reversible: uninstall restores `AGENTS.md`/`config.toml` **byte-for-byte** and `hooks.json` deep-equal, preserving foreign tables/hooks. fablever **never reads/stores/prints** Codex tokens (`auth.json`/`CODEX_ACCESS_TOKEN`) and needs no OpenAI key — verified by planting a fake token and asserting zero leak. The Claude path is unchanged (original behavior when `FABLE_HOST` is unset). | `node test/codex-install-test.mjs` (37 checks: reversibility + privacy), `docs/CODEX.md`, `codex/lib/codex-install.mjs` |

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
`mcp/src/server.js` → `fableCheck()`, covered by `node test/mcp-test.js` (56 checks). Earlier, smaller
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
  evals here do not simulate it. A sibling project (`fivetaku/fablize`) names this gap precisely as the
  **"harness paradox"**: an always-on gate can fill context with verification noise and *cost* long-session
  attention, so a 0.0 lift is a break-even warning, not a pass. Measuring it needs an **out-of-band holdout**
  design (gate ON vs OFF, outcome signals harvested post-hoc from git/transcripts) — logged as the
  highest-leverage next eval in [`eval/technique-ab/RESEARCH-upgrade-points.md`](eval/technique-ab/RESEARCH-upgrade-points.md).
  That holdout is now a **runnable opt-in** (`node install.mjs --with-measure-holdout`, `measurement/`),
  default OFF. The repo's "style not capability, no magnitude claimed" position is
  now backed by runs, not just conceded; index in [`EVALS.md`](EVALS.md).
- **The `unsupported-done-claim` rule is a lexical proxy, not a verifier.** It catches the common wording
  failure ("it works", "고쳤고 작동합니다") but misses completion implied by tone with no trigger word
  ("all green, ship it"), and cannot know whether a cited check is real. That ceiling is published in the
  regression's `hard_cases_known_limits` (`eval/unsupported-claim-regression/`).

If you found a weakness not listed here, that is a contribution — it belongs in an issue, and
under this repo's own rules it becomes a blocker until conceded, fixed, or rebutted.

---

## 5 · Reproduce everything (don't trust — run)

Step-by-step commands: [`whitepaper/07-reproduce.md`](whitepaper/07-reproduce.md).

- **Offline, no keys:** `node eval/ultra/score.mjs` recomputes the candidate/confirmed counts
  behind the headline straight from committed raw data ([`eval/ultra/raw/`](eval/ultra/raw/)).
- **The delivery-gate result (§2.1), offline:** `cat eval/comparison/fable-check-sim/out4/RESULTS.md`
  reads the 27–0 / 80.6%-vs-12.9% tally; the raw per-task judgments it was computed from are committed
  alongside in `out4/judge/`. The gate itself is exercised by `node test/mcp-test.js` (56 checks).
- **The unsupported-claim rule (offline, no keys):** `node eval/unsupported-claim-regression/run.mjs`
  regression-scores the rule against a labeled EN+KO fixture (100% accuracy; limits in its RESULTS.md).
- **Codex native install (sandboxed, no token reads):** `node test/codex-install-test.mjs` verifies
  style-only/full install, idempotent re-install, marker-only uninstall, reversibility, and zero token leak
  across 37 checks in a throwaway HOME/CODEX_HOME.
- **Preview before installing:** `node install.mjs --dry-run [--json]` (or `--codex-full --dry-run`) prints
  the change plan (files, hooks, MCP, network, credentials, uninstall, risk level) and writes nothing.
- Tests: `npm test` (orchestration contract + runtime smoke + MCP + fusion + install lifecycle + Codex + unsupported-claim regression).
- The Claude-only A/B (`eval/ab-harness.mjs`) is a **Workflow-tool module**, not a bare-`node`
  script; its recorded output is committed at `eval/results-2026-06-15*.md`.
- The cross-model ULTRA pipeline — scripts **and** the raw JSON they produced — is committed in
  [`eval/ultra/`](eval/ultra/); only the live judge step needs your own API keys (read the scripts
  before running — supply-chain hygiene).
- **The technique A/Bs** (independently testing generic ideas, judged by GPT-5.5 via the Codex CLI) live in
  [`eval/technique-ab/`](eval/technique-ab/) with every runner, raw generation, and verdict committed:
  plan-first (adopt), local-context seeding + auto-generated seed (adopt — auto reaches 88.9% vs 100%
  hand-written), and the evidence-loop refined to its winning **inline** packaging (beats baseline 26–6
  pooled, p=0.0005). **Both changes wired into production were re-checked by a second lab (Gemini 3.1 pro)** on
  the same on-disk outputs, identical instructions: the inline directive — Gemini prefers it **30–2 (93.8%,
  p<0.0001)** vs GPT-5.5's 26–6 ([`…/RESULTS-rejudge-gemini.md`](eval/technique-ab/RESULTS-rejudge-gemini.md));
  the `fable-seed` skill's auto-seed adherence — Gemini reproduces it almost exactly (**auto 88.9% under both
  labs**, hand 100%, no-seed 22–33%) ([`…/RESULTS-regrade-autoseed-gemini.md`](eval/technique-ab/RESULTS-regrade-autoseed-gemini.md)).
  Two labs agree on both — judge-robust, not single-judge artifacts.
- **A directive audit that argues *against* the project's own shipped style.** Ablating the three most
  elicitable flagship directives one at a time (full Fable vs the style with that one paragraph removed,
  hook off so the style is the only variable) returns a single-shot **null every time** — over-build 10–5,
  lead-outcome 6–10, report-stop 10–4; none p<0.05; pooled 26–19 (57.8%, p=0.37). The honest reading is not
  "cut them" (2/3 trend positive, none harmful) but "their value is longitudinal, where a one-turn A/B can't
  see it" — which is exactly why the out-of-band holdout is the decisive measurement, not another single-shot
  run ([`eval/technique-ab/RESULTS-directive-audit.md`](eval/technique-ab/RESULTS-directive-audit.md)).
  Upgrade-research writeup: [`eval/technique-ab/RESEARCH-upgrade-points.md`](eval/technique-ab/RESEARCH-upgrade-points.md).

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

## Opus-upgrade opt-in mechanisms (v1.4-track — shipped default-off, measurement pending)

A stage×goal upgrade added deterministic scaffolding for evidence-grounded completion. Every mechanism
below is **additive, opt-in, and default-off**: a default v1.3.0 install is behavior-unchanged (an
opt-in audit + a v1.3.0 behavioral snapshot enforce this). Each ships with a deterministic test that
gates its guarantees; **no effect-size is claimed** — the A/B and holdout experiments that would
measure whether these help on a stronger model **have not been run** (they are budget- and
measurement-gated). The verified-loop A/B is pre-registered (`eval/opus-prereg/verified-loop-ab-2026-07.prereg.json`);
each remaining experiment binds its own pre-registration before it runs (the binding lint refuses a
result without one). What is shipped is the *mechanism and its guardrails*, not a result.

| Mechanism | What it enforces (a guardrail, not a magnitude) | Test |
|---|---|---|
| Cost instrumentation | per-arm tokens + wall-clock + fixture hash; checked hook-exemption precondition | `test/cost-instrumentation-test.mjs` |
| Hidden-oracle fixture | multi-part tasks with hidden executable oracles (bidirectional, non-trivial) | `eval/opus-fixture/validate.mjs` |
| Pre-registration binding | a magnitude result must bind to a prereg recorded before the run | `test/opus-prereg-test.mjs` |
| Magnitude-claim lint | flags an unmeasured Opus effect-size claim, or uncited orchestration-superiority prose, in the docs | `test/opus-claim-lint-test.mjs` |
| Retry/iteration budget | proven caps (generation-round = 1); halt-and-surface on exhaustion | `test/retry-budget-test.mjs` |
| Read-only verifiers | advisory roles are a subset of a read-only allowlist (falsifiable) | `test/readonly-verifiers-test.mjs` |
| Pre-flight route gate | a route below its cost floor is refused before any agent spawns | `test/preflight-gate-test.mjs` |
| Single writable authority | contract + append-only ledger; a doctored cache cannot forge completion | `test/run-state-test.mjs` |
| Evidence receipts | a criterion completes only when bound to a fresh executable-check receipt | `test/evidence-receipt-test.mjs` |
| Bounded verified loop | completion repaired only by an executable PASS; retry only by a FAIL, repair-only | `test/verified-loop-test.mjs` |
| Restart recovery | next criterion reconstructed from contract + ledger alone (no replay) | `test/restart-recovery-test.mjs` |
| Active-run doctor | names the violated invariant + a safe next action; report-only | `test/run-doctor-test.mjs` |
| Two-strike continuation | ledger-derived progress; bounded resumes (no infinite continuation) | `test/continuation-test.mjs` |
| Cost-only tier routing | mechanical work → cheaper tier, judgment → Opus; no quality claim | `test/tier-routing-test.mjs` |
| Hook-exemption (opt-in) | flag off = v1.3.0-identical injection; on = no restraint payload for recipe verifiers | `test/hook-exemption-test.mjs` |
| Durable plan artifact | decision-complete plan, hash-bound to the contract; product files untouched during planning | `test/plan-artifact-test.mjs` |
| Task-criteria capture | at most one clarify question (no mandatory interview); criteria parseable by `fable_check` | `test/task-criteria-test.mjs` |
| Verification-debt state | planned/done/verified + open debt on the SAME single authority (no second store) | `test/state-debt-test.mjs` |
| Holdout arming (measurement) | condition-blind Opus arm assignment; inert unless `FABLE_MEASURE=on` | `test/measurement-assignment-test.mjs` |
| Verified-loop A/B harness | 4-arm harness armed + fail-closed on the real run (budget-gated); scoring reads the hidden oracles | `test/verified-loop-ab-test.mjs` |
| Opt-in flag audit | flag manifest + fail-closed scan; empty default behavioral diff vs v1.3.0 | `test/optin-audit-test.mjs` |
| Ledger evidence bookkeeping | every done row is FS-backed; every gate carries an independent reviewer verdict | `test/ledger-evidence-test.mjs` |

Deferred (budget/measurement-gated, not shipped as a result): the Stage-1 Opus rebaseline, the
verified-loop A/B, the skill-trigger-phrasing A/B, the stop-gate holdout, the tier-routing cost eval,
and the resume A/B. Each is armed (harness / pre-registration / fixture) and waits on the owner's
measurement go-ahead; none asserts a magnitude in the meantime.

**Boundary record (proven negatives — do not re-add):** the disproven forms stay rejected — an
always-on parallel roster (single-agent-with-lens-menu already matched it at a fraction of the cost),
a 500-iteration oracle loop, a mandatory interview stage, count quotas, a second evidence-rewrite
pass, generation-round escalation, a duplicate state store, quality claims about tier selection, and
judge-preference-triggered retries. Each has a controlled-A/B basis; re-introducing one requires a new
A/B that overturns it. The bounded verified loop is the honest kernel that keeps the useful part
(verify before claiming done) while avoiding every one of those. See `docs/VERIFIED-LOOP.md`.

---

*Not affiliated with Anthropic. Claude, Anthropic, and Fable are Anthropic trademarks, used
nominatively to describe what this independent community tool works with. See [`NOTICE`](NOTICE).
Provenance and full claims ledger: [`docs/PUBLICATION-READINESS.md`](docs/PUBLICATION-READINESS.md).*
