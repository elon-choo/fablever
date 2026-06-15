# Publication Readiness — Claims Under Adversarial Test

This document is the **review target** for a multi-persona + multi-model consensus
loop. It states, plainly and without spin, every load-bearing claim the `fablever`
project would make to the open-source community, plus the two *aspirational theses*
the owner wants grounded. Critics (Claude expert personas AND different-weights
models — GPT, Gemini) attack each claim. A claim survives only if it withstands the
strongest valid criticism from BOTH families. The hardened result is the consensus.

> The honest posture is binding: **scaffolding is a multiplier on base competence,
> never a substitute.** Direction comes from mechanism; **magnitude comes only from a
> pre-registered, model-swap, condition-blind A/B that has not yet been run.**

---

## The system (three subsystems)

**A — Behavioral profile.** An always-on Claude Code *output style* (+ optional
UserPromptSubmit / SubagentStart hooks + a zero-dependency MCP) that makes any Claude
worker model adopt Fable's *working style*: decisive, outcome-first, restrained,
evidence-grounded, stop-when-done. Style transplant, not capability transplant.

**B — Orchestration layer.** A library of self-contained **Workflow-tool** recipes
(`adversarial-verify`, `divergent-explore`, `decompose-first`, `pipeline-map`,
`judge-panel`) + a triggered `orchestrate` skill + a seeded-defect eval harness. The
thesis: Fable's orchestration edge lives in the *executed control-flow layer*
(parallel barrier, schema-forced output, JS-owned gates/termination), not in prose.

**C — Cross-model verification.** An off-by-default arm that adds a genuinely
different-weights reviewer (GPT/Gemini via OpenRouter, or GPT via the codex MCP) to
the verify loop, to decorrelate the same-family blind spot. Zero overhead when off.

---

## The claims (what the repo asserts)

### Subsystem A
- **A1** Output styles are fixed at session start (not per-turn); the profile steers
  *working style*, not knowledge or reasoning.
- **A2** It is a STYLE transplant. Capability lives in the weights and is NOT ported.
- **A3** It is **unvalidated for outcomes**: the bundled leaktest measures four
  surface-style proxies (median words, tool:text ratio, caveat%, opener%) that its own
  header disclaims as "not a measure of correctness." This is disclosed, not hidden.
- **A4** The hooks are fail-safe (errors fall open), toggleable (`FABLE_PROFILE=off`),
  and reversible (`install.sh --uninstall` restores prior settings). They never echo
  the model's hidden reasoning (which would trip a refusal).

### Subsystem B
- **B1** Orchestration belongs to the Workflow-tool layer, not the output-style layer.
  Verified at source: the pre-orchestration repo had an empty `skill/` dir and zero
  executable orchestration primitives.
- **B2** The recipes are real programs — a real `parallel()` barrier, real
  schema-forced output, real JS-owned stopping rules and gates — *not* prose "behave
  like Fable" instructions. Model-swap persistence is the falsifiable discriminator we
  will use against the placebo objection, but it is **necessary, not sufficient**: the
  current A/B cannot yet isolate executed control-flow from the per-lens prompts, the
  lens taxonomy, fresh context, and draw count (ML-1 / EVAL-7). So the grounded claim
  today is "context-isolation + decomposition help (one realization of which is executed
  control-flow)," **not** "the edge is executed control-flow, not prose." (Demoted at
  Round 2 — codex/GPT-4o flagged this as an internal contradiction with the ML-1
  correction.)
- **B3** Scaffolding is a multiplier on base competence, never a substitute; the
  ceiling is "closer to Fable," never "equal." Per-agent correctness, per-skeptic
  refutation depth, per-idea quality, and off-catalog graph design stay weights-bound.
- **B4** **No magnitude/productivity number is claimed.** The eval harness
  (`eval/ab-harness.mjs`) is pre-registered, stratified (a/b/c + divergent), model-swap,
  condition-blind — and HAS NOT BEEN RUN. (It also does not yet instrument tokens or
  wall-clock, so the decision rule's cost clauses are not yet enforceable — COST-3.)
  Until it shows a replicated, judge-scored gain at non-degraded cost, no orchestration
  magnitude claim ships.
- **B5** The RED runtime gate is **leaf-ungameable but orchestrator-gameable** (a
  hollow rubber-stamp skeptic satisfies the existence check). Stated as such; evidence
  quality is scored offline only, never at the runtime gate.
- **B6** The layer was dogfooded across 3 adversarial rounds: `adversarial-verify` was
  **author-run via the Workflow tool** against its own source during development and
  found real bugs each round, which were fixed (round 3 verified rounds 1-2 held). These
  were dev-time runs with **no committed run-log artifact**, and the shipped CI suite
  (`test/orchestration-test.js`) is static-only — so a *reproducible* runtime smoke test
  is an open gap (H4/H5). B6 is author-attested execution, not a user-reproducible proof;
  it does not contradict H4/H5 (which is specifically about the CI suite).

### Subsystem C
- **C1** A same-family Claude panel shares a correlated blind spot; a different-weights
  model catches a class of defect the panel structurally cannot.
- **C2** Off by default; when off it adds ZERO agents/network/overhead — the
  cross-model branch is the *absence of an argument*, not a runtime flag that is checked
  and skipped.
- **C3** Cross-model verdicts are BONUS coverage: folded into findings/synthesis, but
  they NEVER change the RED gate and must NEVER be the A/B eval judge (treatment leak).
- **C4** Supply chain: the only network/key surface is the zero-dependency
  `fusion-server.js` (built-in fetch, no npm deps, no postinstall/prepare). It sends the
  artifact to a third-party proxy (OpenRouter) only when the user explicitly enables it
  and only for the calls the user triggers.

### Subsystem D — Legal / provenance hygiene (added Round 1, finding LN6)
- **D1** A trademark non-affiliation notice is present (Claude/Anthropic/Fable are
  Anthropic marks, used nominatively; the project is independent and unendorsed).
- **D2 — OPEN (goal, not yet met).** *Goal:* pin the governor's provenance to an
  archived quotation/snapshot of the PUBLIC Anthropic guidance (not a live URL or local
  cache) so "distilled from official guidance" is independently checkable. *Status:* no
  archived snapshot ships yet — provenance currently rests on live `platform.claude.com`
  URLs plus a local cache. This remains a launch blocker for the provenance claim.
- **D3** No leaked/proprietary content is redistributed; the leaked-prompt repo was a
  cross-check only, contributed no shipped text, and is disclosed as such.
- **D4** A real copyright holder is named (LICENSE + package.json author).

### The two aspirational theses — DEMOTED at Round 1 (unanimous, 10/10 critics)
- **T1 (criticism-resistance) — DEMOTED.** Original ("publishable without *any* valid
  criticism") is an unachievable, self-defeating bar: it is a dare that summons a
  pile-on (Streisand), and any sufficiently adversarial reviewer can always find an
  unconceded methodological gap. **Demoted form (a process, not a guarantee):** *the
  project STRIVES to anticipate criticism — to have any criticism a reviewer raises
  already conceded in writing or rebuttable at source — while claiming no methodological
  perfection and NOT asserting that no unconceded valid criticism exists. A new gap a reviewer finds is treated as a
  publication blocker until conceded, fixed, or rebutted.* (Round 2 itself surfaced
  unconceded gaps — the B2/README contradiction below — which is the process working,
  not the claim failing.) This wording is **internal discipline only**: it shapes the
  public docs' humility, but the meta-claim itself never appears in the README or any
  launch post (OSS-3). The public face is the disclosed limitations list, not a claim
  of invulnerability.
- **T2 (productivity) — DEMOTED.** "Demonstrably improves productivity" directly
  contradicts B4 (no magnitude before the A/B) and the A/B has not run. **Demoted
  form:** *productivity improvement is a hypothesis with mechanism support; magnitude
  is unmeasured and the bundled A/B can falsify it.* Moreover **cost-direction**
  (does the panel beat a strong solo pass *per unit cost*?) is **not** established by
  mechanism either. The A/B's `caught_per_agent` is a first **agent-count proxy** for it,
  but true token/wall-clock cost-direction needs **call-site** instrumentation the Workflow
  runtime cannot provide (no `Date.now`/usage) — so even after the A/B runs, cost-direction
  stays partly open until that call-site capture is added (COST-3/COST-6).

---

## The honest tension to be adjudicated (stated up front, not hidden)

T2 is the load-bearing risk. The project's own B4 forbids a magnitude claim before the
A/B runs. So either:
- **(i)** T2 must be *demoted* to "productivity improvement is hypothesized with
  mechanism support; magnitude is unmeasured and falsifiable via the bundled A/B," OR
- **(ii)** the A/B must actually be run to ground a real number.

The consensus loop must decide which. A publication that pre-concedes the criticisms a
skeptic is likely to raise **minimizes** valid overclaiming criticism — it cannot
**eliminate** it (perfect foresight is impossible; Round 2 found real gaps Round 1
missed), but it is the only honest route toward the demoted T1.

---

## Consensus log

### Round 1 — critics fielded

- **Claude panel (7 source-verifying personas):** ml-researcher, eval-methodologist,
  cc-harness-engineer, oss-maintainer, security-auditor, skeptical-practitioner,
  legal-naming. Each Read the actual repo files before asserting (findings carry a
  `source_checked` field). 50 findings.
- **Cross-models (different weights, blind to the Claude panel for decorrelation):**
  codex GPT (15), OpenRouter GPT-4o (6), OpenRouter Gemini-2.5-flash (10). ~31 findings.
- Total ~81 raw findings; heavy overlap → deduped below by theme.

### Round 1 — two adversarial findings REFUTED at source (credit where it doesn't land)

These are recorded because a criticism-resistant project must show the attacks that
*failed*, with proof:

- **H1 "`SubagentStart` is not a real Claude Code hook event" — REFUTED.** Verified
  against the official docs (`code.claude.com/docs/en/hooks.md`, via the
  claude-code-guide agent): `SubagentStart` **is** a documented lifecycle event that
  fires on subagent spawn and supports `hookSpecificOutput.additionalContext` injection.
  The cc-harness persona reasoned from
  an outdated event list. *Action:* this is not a retraction — it is a doc improvement
  (cite the authoritative URL in the README so the claim stops resting on the circular
  "a subagent reported receiving it"). A version-compatibility note is warranted for
  users on an older CLI.
- **ML-5 cross-verify contamination + leaktest over-claim — REFUTED.** At source,
  `fable_cross_verify` exposes **no** `fable_style` parameter and never injects the
  Fable system prompt (only the general-purpose `runFusion` does), so the verify-path
  independence the cross-model arm sells is not contaminated. And the leaktest
  over-claim is pre-conceded in the leaktest header, README, and B4. *Action:* add one
  line to `xverify.md` stating `fable_cross_verify` is Fable-style-free.

> Note (no spin): H1 was corrected by an independent **documentation check** — the
> claude-code-guide agent reading the official hooks reference — **not** by the project's
> own `fable_cross_verify` machinery. So this is **one data point (n=1) consistent with**
> the decorrelation thesis (a different source caught a confident same-family
> false-positive), **not a validation** of it. Per the report's own standard, a single
> uncontrolled observation licenses direction, never proof.

### Round 1 — valid findings, deduped by theme (with disposition)

**BLOCKERS (must close before any public launch):**
1. **Demote T1 & T2** (ML-7, OSS-3, codex-F1/F2, gpt4o-F4/F5/F6, gemini-F6/F7;
   unanimous). → DONE in this doc (above); README must never carry T1 language.
2. **OSS-1 broken quickstart** — README:19 `git clone …/fablever && cd fable-profile`
   fails (repo clones to `fablever/`). CONFIRMED at source. → README fix.
3. **OSS-2 / LN1 brand appropriation + no non-affiliation notice** — product named
   after Anthropic's model, possessive tagline, zero disclaimer, no NOTICE. CONFIRMED.
   → README disclaimer + NOTICE file + softened tagline (D1).
4. **COST-3 the A/B harness measures neither tokens nor wall-clock**, yet the decision
   rule (eval/README) makes both load-bearing. CONFIRMED (0 timing/usage calls). →
   instrument the harness OR demote the rule honestly (code batch, pending approval).

**MAJORS (close before claiming criticism-resistance):**
- **ML-1 / EVAL-7 confounded A/B** — arm B differs from arm A in control-flow AND
  per-lens prompt decomposition AND the lens taxonomy (three un-matched confounds), so a
  persistent gain does not isolate "executed control-flow." (The `NO_RESTRAINT` override
  is injected into BOTH arms in code, so it is matched — not a confound — and both arms'
  absolute rates are therefore non-default; R2-EVAL-F.) → add a prompt-matched arm
  (single agent, all lenses, one context) and **downgrade B2's headline** from
  "executed control-flow, not prose" to "context-isolation + decomposition (one
  realization of which is executed control-flow)." → DONE-doc at Round 2.
- **ML-4 draw-count artifact** — arm B reports the union of N draws vs arm A's 1 draw;
  more draws mechanically catch more. → add an N-matched single-agent control; pre-register
  the confound.
- **ML-2 "completion attractor"** is a coined term elevated to "known transformer
  behavior." → relabel the three mechanisms as MOTIVATING HYPOTHESES; keep mode-collapse
  (citable) distinct from the intuition-level two.
- **ML-3 divergence decorrelation is prompt-conditioning** (a prose lever), not pure
  structural independence. → state plainly: independence prevents cross-contamination;
  lens-prompting supplies the diversity; neither raises per-idea quality.
- **ML-6 RED-gate zero-findings message overstates** ("Safe to deliver") given C1's
  correlated blind spot. → soften the message; add the correlated-false-negative case to
  B5's conceded limits (code batch).
- **EVAL-1 power** — pre-reg commits to p<0.05 but the fixture has n=2; no power
  analysis. → add sample-size justification; label the rule unsatisfiable on the seed.
- **EVAL-2 multiplicity** — many strata × models, one uncorrected p. → designate ONE
  primary endpoint + a correction (Holm/FDR) or hierarchical gating.
- **EVAL-3 blinding is nominal** — panel union vs single agent is structurally
  distinguishable, so the judge can infer the arm. → normalize both arms to a common
  format or measure residual leakage.
- **EVAL-5 fixture leakage / author-judge collusion** — hand-authored, stratum-labeled
  defects shown to the judge verbatim; the fixture _README pre-declares the expected
  per-stratum result. → require independently-sourced defects; remove the expected-outcome
  note from the scored artifact.
- **H3 / SEC-3 EXEMPT_RE overbroad** — `/verif|search/` silently strips the profile from
  unrelated user agents (`doc-search`, `fact-verifier`). CONFIRMED. → exact-match
  allowlist + Fable-namespaced prefix + a log line (code batch).
- **H4 / H5 no runtime test of any recipe** — `pipeline()`/`parallel()` settle-to-null
  contract is asserted in comments, never executed in tests. → add ≥1 live smoke run per
  primitive before the word "runnable."
- **OSS-4 RESEARCH "16 sources" padded with SEO/affiliate blogspam.** → demote the table
  to an appendix; lead with the two primary Anthropic sources.
- **OSS-5 leaktest table placed as lead evidence** (it is a model-gap, not a before/after
  of the profile). → reframe as "the gap we target," move below the mechanism.
- **OSS-6 README reads as AI-slop** and contradicts the profile's own "no filler, minimal
  markdown" rule; self-promotes its own review panel. → cut ~half; drop the self-promo.
- **SEC-1 MCP runs from the mutable clone dir** every session. → copy server.js into
  `~/.claude/` (as hooks already are) OR scope the supply-chain claim to install-time.
- **SEC-2 uninstall MCP removal gated on the `claude` CLI** (silent leftover entries
  otherwise). → deterministic settings strip in Node.
- **SEC-5 cross-model egress is automatic once enabled + the artifact is a prompt-injection
  vector.** → document the OpenRouter→OpenAI/Google fan-out, add a size cap, state that a
  hostile artifact can steer the verdict (so cross-model "all clear" is non-authoritative).
- **COST-1 / COST-2 the stay-solo floor is model-decided, not JS-deterministic**, and
  judge-panel has NO floor at all (despite SKILL.md claiming "every recipe has one"). →
  correct the claim; add a `highStakes` guard to judge-panel (code batch).
- **COST-4 / COST-6 cost is not measured and cost-direction is not established by
  mechanism.** → report a cost-normalized metric; state cost-direction is open.
- **LN1–LN6 legal hygiene** — no trademark notice, unverifiable model-provenance anchor,
  phantom copyright holder, leaked-prompt in the basis, four project names. → D1–D4 +
  NOTICE + provenance pin + named holder.

**MINORS (tracked):** EVAL-4 judge monoculture · EVAL-6 pre-reg not immutable (hash-pin)
· EVAL-8 / H2 hook-exemption field unconfirmed on the live payload (manual boolean) ·
H6 orchestrate opt-in unenforced (no switch like xverify.json) · H7 hook timeout / blocking
stdin read · SEC-4 unsanitized `tpath` in reinject hook · SEC-6 secrets-in-env guidance ·
SEC-7 divergent HTTP-Referer (CONFIRMED: fable-profile vs fablever) · OSS-7 four names ·
OSS-8 / LN2 model-premise URL fragility on a logged-out reader.

### Round 1 — convergence check + status ledger

Not converged at Round 1: 4 blockers + ~20 majors. Per-finding status (DONE-doc /
DONE-code / STAGED-code / OPEN), corrected at Round 2 so nothing reads as "done" that is not:

| finding | status after Round 2 |
|---|---|
| Demote T1 & T2 | DONE-doc (further softened at R2: T1 = process-not-guarantee) |
| OSS-1 broken quickstart (README) | DONE-doc; **CONTRIBUTING.md had the same bug → DONE-doc at R2** |
| OSS-2 / LN1 disclaimer + NOTICE | DONE-doc (R2 confirmed durable) |
| OSS-4 padded "16 sources" | PARTIAL → R2 demoted the RESEARCH.md lead; **table→appendix still pending** |
| OSS-5 leaktest-as-evidence | DONE-doc (reframed as target) |
| OSS-6 README slop/length | PARTIAL (self-promo + source framing fixed; full length trim pending) |
| ML-1/EVAL-7 B2 "control-flow not prose" | DONE-doc at R2 — propagated to B2, README, ORCHESTRATION-RESEARCH §3/§5 |
| ML-2 mechanism relabel | DONE-doc (R2 confirmed sufficient) |
| ML-3 divergence honesty | DONE-doc (R2 confirmed) |
| ML-6 RED-gate message | DONE-code (softened) + DONE-doc |
| COST-3 tokens/wall-clock unmeasured | OPEN-code (doc now honest everywhere incl. ab-harness note) |
| EVAL-1/2/3/5 + confounds | DONE-doc (R2 fixed the residual "Files"/"detects"/immutability/stratum inconsistencies) |
| COST-1/COST-2 floor honesty | DONE-doc + DONE-code (judge-panel `highStakes` floor added) |
| H3/SEC-3 EXEMPT_RE over-broad | STAGED-code (live-hook change, owner approval) |
| H4/H5 no runtime test → "runnable" | OPEN-code; doc softened to "launchable; committed smoke test pending" |
| SEC-1 MCP from clone dir · SEC-2 uninstall | STAGED-code |
| SEC-5 egress/injection | DONE-doc; **size cap = disclosure-only chosen (was over-promised) ** |
| SEC-7 Referer | DONE-code |
| LN1 trademark / LN3 holder | DONE-doc/config (R2 reconciled NOTICE holder + leak language) |
| D2 provenance archived snapshot | OPEN (now marked OPEN, was over-stated as closed) |
| FABLE_XVERIFY codex kill-switch | DONE-doc at R2 (scoped to OpenRouter; codex switch documented) |

### Round 2 — critics fielded + verdict

- **Claude panel (6 source-verifying personas):** oss-maintainer, eval-methodologist,
  ml-researcher, legal-naming, security-auditor, completeness-critic (consensus-doc
  honesty audit). Instructed NOT to re-list staged items — only durability of applied
  fixes, NEW issues, and honesty of this log.
- **Cross-models:** codex GPT ("still-overclaims"), GPT-4o ("mixed"), Gemini-flash
  ("survives"). All three independently flagged the same top issue.

**What HELD (durability confirmed, attacks refuted):** the T2 demotion ("a model of
honesty"), the D-block, the refuted-findings records, OSS-1/OSS-2/LN1, ML-2/ML-3.

**What Round 2 caught (mostly uneven propagation of the Round-1 fixes — all now fixed
in doc):** the strong "executed control-flow, not prose" headline still in README/§5/B2;
CONTRIBUTING.md's duplicate broken clone; eval/README's old "Files"/"detects"/immutability
lines contradicting the new honest sections; B6 vs H4/H5 wording; NOTICE holder + leak
language vs RESEARCH; D2 over-stated as closed; SEC-5 size-cap over-promised in the log;
FABLE_XVERIFY not gating the codex path; the H1 "strongest demonstration" self-credit; the
T1 universal-claim overreach. **No new BLOCKER survived** — the lone "blocker"-tagged R2
finding (B6 "fabricated dogfood") was not fabrication (the runs were real and
author-attested), but it correctly flagged a real **verifiability gap** — no committed,
user-reproducible run-log — which the doc now states precisely and tracks under H4/H5
(now partly closed by the runtime smoke test, though that tests the contract via stubs, not
the original dogfood runs).

### Convergence status

**Doc layer: at/near convergence.** Round 2's findings were almost entirely
consistency/propagation gaps in the Round-1 doc edits, now closed; the substantive
posture (demoted T1/T2, honest confounds, legal hygiene) held under re-attack from both
families. Remaining doc items are minor (RESEARCH table→appendix; full README trim; D2
snapshot).

### Round 2.5 — owner-approved code batch APPLIED (all 4)

The owner approved the staged code batch; it is now applied and verified (tests green:
runtime-smoke 6/6, orchestration 33/33, mcp 16/16, fusion 9/9, install-lifecycle ALL):

- **H3/SEC-3 EXEMPT_RE → DONE-code.** `fable-subagent.js` (repo + live `~/.claude/hooks/`)
  now exact-matches the calibrated orchestration types + a word-anchored role regex; the
  broad `verif`/`search` substrings are gone (no more silent strip of user agents), with a
  stderr log on exempt.
- **COST-3/4 + ML-1/4 harness → DONE-code (within runtime limits).** `ab-harness.mjs` now
  runs FOUR arms: baseline, **prompt-matched control** (all lenses, one context — isolates
  the taxonomy), **draw-matched control** (N generic draws, union — isolates draw count),
  and the panel; reports an **agent-count-normalized** `caught_per_agent` (a cost *proxy*,
  not token/wall-clock cost). True token/wall-clock cost stays call-site (the Workflow runtime
  exposes neither `Date.now` nor usage) — documented, not silently dropped. Per-agent
  comparisons are apples-to-apples only between agent-count-matched arms.
- **H4/H5 runtime test → DONE-code.** New `test/orchestration-runtime-test.js` EXECUTES
  `adversarial-verify` against contract-faithful stubs and asserts the `parallel()`
  settle-to-null contract + the RED gate (pass on full panel, FAIL on full/partial crash) +
  the complexity floor. Wired into `npm test`. "Runnable" is now earned for the contract.
- **SEC-1 MCP-from-clone → DONE-code.** `install.sh` copies the runtime subtree
  (`mcp/`+`fusion/`+`profiles/`, preserving the relative paths the servers read) into an
  **immutable** `~/.claude/fable-profile/runtime/` and registers from there. (Future installs
  only; the live registration on the build machine is untouched until re-install.)
- **SEC-2 uninstall → DONE-code.** New `claude-code/lib/mcp-remove.js` strips the two MCP
  entries from `~/.claude.json` deterministically (backup, named-keys-only), wired into
  uninstall as the fallback when the `claude` CLI is absent.

### Round 3 — convergence test (docs + applied code) + verdict

- **Cross-models:** codex **converged / "publishable-bounded" / 0 findings**; GPT-4o
  **"survives"** (all minor); Gemini-flash **"survives"** with one major (cost-direction
  terminology, now fixed).
- **Claude panel (4 personas):** eval-methodologist, security-auditor, ml-researcher all
  returned **converged=true**, each having **source-verified that the code batch genuinely
  closes its finding** (4-arm harness isolates ML-1/ML-4; EXEMPT_RE covers real workers
  without false-positives; mcp-remove touches only named keys; the immutable copy removes the
  clone-execution surface). The completeness-critic returned the **one surviving major**.
- **The one surviving major (CC-R3-1):** `eval/README` had not been re-synced after the
  Round 2.5 code change — it still described the controls as "Required (future)" and the
  harness as two-arm. *Same drift class the loop exists to catch; under-claiming, not
  over-claiming.* **Fixed at Round 3** (Confounds ML-1/ML-4 marked closed-in-code; Files
  bullet now says four arms). Plus minors fixed: cost-direction terminology, `caught_per_agent`
  apples-to-apples scope, T1 "strives", B6 verifiability-gap wording, meta.description.

**Convergence reached (bounded sense).** Across 3 rounds × (7+6+4 Claude personas) × (codex +
GPT-4o + Gemini), the only findings that survive re-attack are (a) **doc↔code sync drift**,
which is mechanical and was closed each round, and (b) the **one irreducible substantive
item no scaffolding can close: T2's productivity magnitude — and the token/wall-clock half of
cost-direction — require actually RUNNING the now-control-instrumented A/B** (and, before it,
the premise-reproduction control). That is honestly documented as OPEN, not claimed.

**Verdict: publishable with bounded, pre-conceded claims** — *not* as "criticism-proof" and
*not* with any productivity-magnitude claim. The defensible public posture is the mechanism +
the honest limitations list + the falsifiable harness; the magnitude number is earned only by
running `eval/ab-harness.mjs` (model-swap, condition-blind) — which is the recommended next
step and needs the owner's go-ahead (it spends worker+judge model calls).

**Remaining (minor, non-gating):** RESEARCH source table → appendix; full README length trim;
D2 provenance archived snapshot.

### A/B EXECUTED 2026-06-15 — first data point (see `eval/results-2026-06-15.md`)

The A/B was actually run with the best models (workers **Opus + Sonnet**, independent
non-Claude judge **GPT-5.2**), 60 worker agents, 0 judge errors. **On the seed fixture it
does NOT support a productivity claim — it points the other way:**
- **No recall gain for the panel** — a single strong agent already caught ~all planted
  defects (ceiling effect; the fixture is saturated), so panel recall ≈ single recall.
- **5× cost regression** — `caught_per_agent` ≈ 0.6 (panel) vs ≈ 3.0 (single); the panel
  spends 5× the agents for the same catches, and **the cost disadvantage persists across the
  Opus→Sonnet swap** (model-invariant ⇒ structural, not placebo).
- Controls worked: the draw-matched arm had the worst precision (raw draws are noisy), and
  the one place a single agent missed (Sonnet, a b-omission), the panel recovered it — a
  faint n=1 hint that decomposition helps *only when there is a miss to recover*.

**Conclusion:** the falsification discipline ran as designed; on easy/saturated tasks the
panel is **pure cost**, so T2 stays **un-grounded (and, on this fixture, contraindicated)**.

### A/B re-run on a HARDER fixture 2026-06-15 (see `eval/results-2026-06-15-hard.md`)

A second run on 6 denser artifacts with 18 subtle planted defects (real bug classes,
deliberately below the single-agent ceiling) created real headroom — and the **controls
delivered the decisive finding:**
- The panel beats the single *baseline* on recall only **slightly** (Opus 15 vs 14, Sonnet
  15 vs 13 of 18) — **but it does NOT beat its own controls.** The **prompt-matched single
  agent** (one agent, full lens menu, one context) caught **16** on Opus at **1/5 the cost**;
  the **draw-matched** arm (30 raw draws) caught the **most** (16–17). So the recall gain is
  the lens *taxonomy* + *draw count* (ML-1/ML-4 confounds), **not** the parallel structure.
- The panel's one **genuine structural win is PRECISION** (0.53/0.73 vs the draws' 0.35/0.44
  at equal agent count) — cleaner output, not more catches. Cost stays a ~5× regression.
- **Actionable result:** the cheap **prompt-matched single agent (A2)** captures most of the
  recall at 1/5 the agents; reserve the parallel panel for when precision-at-scale matters.

**Net:** even with headroom, T2 ("productivity demonstrably improves") is **not supported** —
the eval *localized* the real value (precision, not recall; and a cheap single-agent config
captures the recall). This is the honest, evidence-backed outcome, and it **strengthens** the
bounded posture: the project ships the mechanism + this falsifying evidence, and makes **no**
productivity-magnitude claim. (Still n=6, author-planted, single judge — directional.)
