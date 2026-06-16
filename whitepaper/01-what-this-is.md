# 1 · What this is (and what it isn't)

**fablever** (a.k.a. fable-profile) applies Anthropic's documented **Fable working-style
guidance** as an always-on output style in Claude Code, and ships an experimental
orchestration layer plus an off-by-default cross-model verification arm. Zero npm
dependencies. Installable by anyone, on any project, for any Claude worker model.

> **Not affiliated with Anthropic.** Claude, Anthropic, and Fable are Anthropic
> trademarks, used here only nominatively to describe what this independent community tool
> works with. See [`NOTICE`](../NOTICE).

This page is the honest map of the three subsystems and exactly what each one is — and is
**not** — claimed to do. The detailed claims ledger (every load-bearing assertion, with
its adversarial disposition) is [§5](05-consensus-and-claims.md).

---

## 1.1 The one distinction that prevents every overclaim

**This is a *style* transplant, not a *capability* transplant.**

It recovers *how* Fable works — decisive, outcome-first, restrained, evidence-grounded,
stop-when-done — and applies that to any Claude model through documented Claude Code
mechanisms (output styles, hooks, MCP). It **cannot** raise a weaker model's reasoning
ceiling, long-horizon autonomy, or per-agent correctness. Those live in the weights and
are not portable. Every result in this whitepaper is consistent with that line: the
orchestration gains come from *structure and decorrelation around* the worker, never from
making the worker itself smarter.

---

## 1.2 Subsystem A — the behavioral profile (style)

An always-on Claude Code **output style** (+ optional `UserPromptSubmit` / `SubagentStart`
hooks + a zero-dependency MCP) that makes any Claude worker adopt Fable's working style.

- Fixed at session start (output styles are not per-turn); steers *working style*, not
  knowledge or reasoning.
- **Fail-safe** (hook errors fall open), **toggleable** (`FABLE_PROFILE=off`),
  **reversible** (`install.sh --uninstall` restores prior settings). It never echoes the
  model's hidden reasoning.
- **Unvalidated for outcomes.** The bundled leaktest measures four surface-style proxies
  (median words, tool:text ratio, caveat %, opener %) that its own header disclaims as "not
  a measure of correctness." Disclosed, not hidden.

## 1.3 Subsystem B — the orchestration layer (structure)

A library of self-contained **Workflow-tool recipes** — `adversarial-verify`,
`divergent-explore`, `decompose-first`, `pipeline-map`, `judge-panel` — plus a triggered
`orchestrate` skill and the seeded-defect eval harness.

- These are **real programs**: a real `parallel()` barrier, schema-forced output, JS-owned
  stopping rules and gates — not prose "behave like Fable" instructions.
- The grounded claim is **"context-isolation + decomposition help"** — *not* "the edge is
  executed control-flow, not prose." The controlled A/B cannot yet isolate executed
  control-flow from the per-lens prompts, the lens taxonomy, fresh context, and draw count.
  We say the narrower thing on purpose.
- **No productivity-magnitude claim ships.** The harness is the falsifier; what it has
  actually shown so far is in [§3](03-results.md).

## 1.4 Subsystem C — cross-model verification (decorrelation)

An **off-by-default** arm that adds a genuinely different-weights reviewer (GPT/Gemini via
a zero-dependency `fusion-server.js`, or GPT via the codex MCP) to the verify loop.

- **Zero overhead when off** — the cross-model branch is the *absence of an argument*, not
  a flag checked and skipped.
- Cross-model verdicts are **bonus coverage**: folded into findings/synthesis, but they
  **never** change the runtime RED gate and must **never** be the A/B eval judge (treatment
  leak). The one place this whitepaper uses cross-model models as *judges* is scoring
  against a known answer key — a measurement setting, explicitly not a live gate.
- This subsystem is what makes the [§4 max-quality configuration](04-max-quality-config.md)
  possible: the different-weights model catches the class a same-family panel can't.

---

## 1.5 The honest posture (binding)

- **Scaffolding is a multiplier on base competence, never a substitute.** Direction comes
  from mechanism; **magnitude comes only from a pre-registered, condition-blind A/B.**
- The public face is the **disclosed limitations list** ([§6](06-limitations.md)), not a
  claim of invulnerability. A new gap a reviewer finds is a publication blocker until
  conceded, fixed, or rebutted.
- What [§3](03-results.md) adds to this posture is a **bounded, evidence-backed** result:
  on a small planted fixture, the cost-no-object cross-model pipeline reaches a real
  defect-catch ceiling that cheaper configs don't — *and that is a defect-catch result, not
  a productivity result.* The distinction is the whole discipline.
