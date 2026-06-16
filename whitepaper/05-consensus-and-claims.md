# 5 · Consensus & claims ledger (current state)

Every load-bearing claim the project makes was put through a **multi-persona +
multi-model** adversarial consensus loop: Claude expert personas *and* different-weights
models (GPT, Gemini) attack each claim; a claim survives only if it withstands the
strongest valid criticism from **both** families. This page is the current, hardened
state. The original blow-by-blow (3 rounds, ~81 findings) lives in
[`docs/PUBLICATION-READINESS.md`](../docs/PUBLICATION-READINESS.md); this is the
consolidated ledger plus the latest (ULTRA) verification round.

> **Binding posture.** Scaffolding is a multiplier on base competence, never a substitute.
> Direction comes from mechanism; magnitude comes only from a pre-registered, model-swap,
> condition-blind A/B. The public face is the disclosed limitations list, not a claim of
> invulnerability.

---

## 5.1 The claims, with disposition

### Subsystem A — behavioral profile
| # | Claim | Status |
|---|-------|--------|
| A1 | Output styles are fixed at session start; profile steers working style, not knowledge/reasoning | holds |
| A2 | STYLE transplant; capability lives in the weights and is not ported | holds (load-bearing) |
| A3 | Unvalidated for outcomes; leaktest measures 4 surface proxies, self-disclaimed | holds (disclosed) |
| A4 | Hooks fail-safe, toggleable (`FABLE_PROFILE=off`), reversible; never echo hidden reasoning | holds |

### Subsystem B — orchestration
| # | Claim | Status |
|---|-------|--------|
| B1 | Orchestration belongs to the Workflow layer, not the output-style layer (verified at source) | holds |
| B2 | Recipes are real programs (real `parallel()` barrier, schema-forced output, JS gates) — **demoted** headline from "executed control-flow, not prose" to "context-isolation + decomposition help" | holds (demoted) |
| B3 | Scaffolding multiplies base competence; ceiling is "closer to Fable," never "equal" | holds |
| B4 | **No magnitude/productivity number is claimed** until the pre-registered A/B shows a replicated, judge-scored gain at non-degraded cost | holds (load-bearing) |
| B5 | RED runtime gate is leaf-ungameable but orchestrator-gameable; evidence quality scored offline only | holds |
| B6 | Layer was dogfooded across 3 adversarial rounds (author-attested; runtime smoke test now covers the contract via stubs) | holds (bounded) |

### Subsystem C — cross-model verification
| # | Claim | Status |
|---|-------|--------|
| C1 | A same-family panel shares a correlated blind spot; a different-weights model catches a class it structurally cannot | holds (the basis for [§4](04-max-quality-config.md)) |
| C2 | Off by default; zero agents/network/overhead when off (absence of an argument, not a checked flag) | holds |
| C3 | Cross-model verdicts are bonus coverage; never change the RED gate, never the A/B judge (leak) | holds — **note the [§3](03-results.md) judge-panel is measurement vs a key, not a live gate** |
| C4 | Only network/key surface is the zero-dep `fusion-server.js` (built-in fetch, no postinstall) | holds |

### Subsystem D — legal / provenance
| # | Claim | Status |
|---|-------|--------|
| D1 | Trademark non-affiliation notice present (nominative use) | holds |
| D2 | Provenance pinned to an archived public snapshot | **OPEN** — still on live URLs + local cache; launch blocker for that claim |
| D3 | No leaked/proprietary content redistributed (cross-check only, disclosed) | holds |
| D4 | A real copyright holder is named | holds |

### Aspirational theses — both DEMOTED (unanimous, Round 1)
- **T1 (criticism-resistance) → a process, not a guarantee.** The project *strives* to
  pre-concede criticism (any gap a reviewer raises is a blocker until conceded/fixed/
  rebutted); it does **not** assert no valid criticism exists. This wording is internal
  discipline only — it shapes the docs' humility and never appears as a public boast.
- **T2 (productivity) → a hypothesis with mechanism support; magnitude unmeasured,
  falsifiable.** Cost-direction (does the panel beat a strong solo pass per unit cost?) is
  not established by mechanism either; `caught_per_agent` is an agent-count proxy, and
  token/wall-clock cost-direction needs call-site capture the runtime can't provide.

---

## 5.2 Verification rounds (summary)

- **Round 1** — 7 Claude source-verifying personas + codex GPT + GPT-4o + Gemini-flash;
  ~81 findings. Two adversarial findings were **refuted at source** (recorded as attacks
  that failed, with proof). Produced 4 blockers + ~20 majors.
- **Round 2** — 6 personas + 3 models, durability re-attack. Found mostly **uneven
  propagation** of Round-1 fixes (doc↔code drift); no new blocker survived.
- **Round 2.5** — owner-approved **code batch applied** (tests green): EXEMPT_RE allowlist;
  4-arm harness (isolates ML-1/ML-4 confounds); runtime smoke test; immutable MCP copy +
  deterministic uninstall.
- **Round 3** — 4 personas + 3 models, convergence. codex **converged / 0 findings**;
  GPT-4o + Gemini "survives." Only surviving item: one **doc↔code sync drift**
  (under-claiming), fixed.

**Round 3 verdict:** *publishable with bounded, pre-conceded claims* — not criticism-proof,
no productivity-magnitude claim. The defensible public posture is the mechanism + the
honest limitations list + the falsifiable harness.

---

## 5.3 The ULTRA verification round (this whitepaper)

A fourth question was put to the same adversarial discipline: *with cost no object, what is
the quality ceiling, and does it survive rigorous judging?*

- **Generated** wide cross-model candidates → **adjudicated** with GPT-5.2 → judged with a
  **5-model cross-family panel** (majority vote), specifically to defeat single-judge
  variance.
- **Adversarially stress-tested the result three ways**, and recorded what each found:
  1. **Single vs panel judge** — a single strict judge said 17/18; the panel majority said
     **18/18**. Lesson: never headline a single judge. (Reported number = panel.)
  2. **Escalation (push harder)** — adding a GPT-5.2 deep-generation pass *lowered* recall
     to 16/18. Recorded as a **failed** improvement attempt; the simpler config is the
     winner.
  3. **Refute pass** — two independent cross-model refuters dropped **0** confirmed defects
     (V2: kept 33/33; V1 likewise). The non-planted "false positives" survive refutation →
     they are genuine extra defects, so precision 0.63 is a **floor from an incomplete
     key**, not a hallucination rate.

**ULTRA-round verdict.** The result **strengthens** the bounded posture rather than
straining it: it is a **defect-catch** ceiling result (T-class bug recall), rigorously
judged, with every tempting overclaim pre-empted — it does **not** touch T2 (productivity)
or B4, and it explicitly **refutes** the "parallel structure wins" reading via its own
controls ([§3.2](03-results.md)). Nothing here moves a demoted thesis back up.

---

## 5.4 Still open (carried, not closed)

- **D2** archived provenance snapshot — launch blocker for the "distilled from official
  guidance" claim.
- **Token/wall-clock cost-direction** — needs call-site instrumentation the Workflow
  runtime cannot provide.
- **A developer-facing productivity A/B** — unrun; the only thing that could ground T2.
- Minor: RESEARCH source table → appendix; full README length trim.
