# Orchestration layer (experimental)

This is the part of the project that actually targets what was different about
Fable in `ultracode`: not its prose style, but **how it orchestrated** — reaching
for the Workflow tool by default, decomposing deeper, fanning out wider, reviewing
independently, and not stopping early.

> **Read [`docs/ORCHESTRATION-RESEARCH.md`](../docs/ORCHESTRATION-RESEARCH.md) first.**
> It is the source-verified consensus (6 personas → debate → arbiter panel →
> completeness critic, CONDITIONAL GO) this layer implements. The honest framing
> matters: **scaffolding is a multiplier on base competence, never a substitute.**
> The ceiling is "closer to Fable," never "equal to Fable."

## The core idea

Authoring orchestration is two separable acts: **(a)** the *decision* to spawn a
workflow instead of answering inline, and **(b)** the *construction quality* of the
agent graph. Fable wins mostly on (a) — a learned routing default — and on doing
(b) against a known menu of decomposition shapes. Both are largely **context-
recoverable**: you can hand a weaker worker the shapes as executable recipes.

What does **not** transplant: per-agent correctness, per-skeptic refutation depth,
per-candidate idea quality, and genuinely novel off-catalog graph design. Those are
weights-bound. We claim breadth and catch-rate, not raw intelligence.

## Why recipes, not a prompt

A prompt that says "orchestrate like Fable" is placebo — it biases surface tokens,
not pre-token control flow. These recipes are **real programs**: a real `parallel()`
barrier, real schema-forced output, real JS-owned stopping rules and gates. That is
the kind of property an on/off test can detect — real control flow *can* persist under a
worker-model swap where prose cannot. The **defect-catch** A/B *has* run with that Opus→Sonnet
swap (see [`../eval/`](../eval/), including a published negative result); what has **not** run is a
developer-**productivity** A/B, so the *magnitude* of any real-world gain stays unclaimed.

## How to run

Each recipe is a **self-contained Workflow script** (the runtime has no
filesystem/import access, so nothing is shared at runtime — `lenses.md` is the human
source of truth that each recipe inlines a copy of). Launch one with the Workflow
tool by `scriptPath`, passing parameters as `args`:

```
Workflow({ scriptPath: ".../orchestration/recipes/adversarial-verify.mjs",
           args: { artifact: "<text or diff to review>" } })
```

You normally do **not** launch these by hand — the `orchestrate` skill
(`claude-code/skills/orchestrate/SKILL.md`) routes a task to the right recipe and
fills its `args`. The skill is pulled on a trigger, never always-on.

## Decision table (task shape → recipe → primitive)

The **preflight route** column applies only when the opt-in cost gate is installed
(`FABLE_ORCHESTRATION_PREFLIGHT=on`); a default install has no preflight and routes as v1.3.0 did.

| task shape | preflight route | recipe | primitive | in-recipe gate |
|---|---|---|---|---|
| "is this artifact/plan/diff sound?" | `panel` | `adversarial-verify` | `parallel()` barrier | RED output-gate |
| "what are the possible approaches?" | `decompose` | `divergent-explore` | `parallel()` + JS loop-until-dry | dry-stop + hard ceiling |
| "do this big multi-part task" | `decompose` | `decompose-first` | task-tree → `parallel()` *or* sequential | complexity floor |
| "process each of N items in stages" | `decompose` | `pipeline-map` | `pipeline()` (no barrier) | per-item verify |
| "produce one high-stakes artifact" | `panel` | `judge-panel` | `parallel()` best-of-N | high-stakes guard |

Trivial tasks should hit a **complexity floor** and stay solo — fan-out on a
one-liner is over-building. The three fan-out recipes (`adversarial-verify`,
`divergent-explore`, `decompose-first`) enforce a floor in JS, not by asking the model;
`judge-panel` is gated to high-stakes artifacts by the decision table, and `pipeline-map`
processes the items it's handed.

> **Preflight cost gate (COST-1/COST-2) — opt-in, default-off.** This gate ships only with the opt-in
> runtime: set `FABLE_ORCHESTRATION_PREFLIGHT=on` at install time and the installer selects the upgraded
> `orchestrate` skill (which invokes the gate before any Workflow launch) and keeps
> `orchestration/lib/preflight-gate.mjs` on disk. **A default install has neither** — it behaves exactly as
> v1.3.0 did, launching a recipe without this gate. When enabled: `single-lens` is
> the default cost route. `decompose` requires `taskSize >= 200` and at least two
> declared independent parts; `panel` requires `taskSize >= 400` and an explicit
> `precisionNeed: at-scale` signal. A refusal does not launch Workflow or spawn an
> agent. The gate authorizes multi-agent spend only; it does not estimate task
> success or model capability, and agent count remains a cost denominator.
> Direct manual Workflow launches bypass the host preflight and retain each recipe's
> existing internal guards.

## Guardrails (binding — from the rejected-ideas list)

- **No count quotas.** Width is keyed to *detected* independent sub-problems, never
  "spawn N." Quotas cause reward-hacking (one good answer split into N worse ones).
- **No shared-context skeptics.** Verifiers run in fresh/empty contexts or it is
  theater (the completion attractor makes an in-thread reviewer rubber-stamp).
- **Agent count is a cost denominator, never a success metric.** It rises whether
  the model games a gate or genuinely helps, so it cannot discriminate the two.
- **The RED gate is leaf-ungameable, not orchestrator-ungameable.** It passes only when
  the *full effective panel* of fresh-context skeptics (every valid requested lens)
  returned schema-valid verdicts (a partial collapse — e.g. 4 of 5 crashed — FAILS), but
  it certifies the panel *ran*, not
  that the refutation was deep, and an orchestrator could still spawn hollow skeptics.
  Evidence quality is scored **offline** (`eval/`), never at the runtime gate.
- **Don't co-load the behavioral profile into orchestration workers.** The shipped
  SubagentStart hook injects a restraint reminder into every subagent; for a skeptic
  that is backwards. Recipes neutralize it at the prompt layer; the clean fix is the
  settings-level exemption in [`HOOK-EXEMPTION-PROPOSAL.md`](HOOK-EXEMPTION-PROPOSAL.md).
- **No magnitude claims before the A/B.** Direction comes from mechanism now; the
  size of the gain comes only from `eval/` (model-swap, condition-blind, stratified).

## Cross-model verification (optional, off by default)

The Claude skeptic panel defeats the completion attractor but shares a same-family
**correlated blind spot**. You can optionally add a genuinely different-weights reviewer
(GPT/Gemini via OpenRouter, or GPT/Codex via the codex MCP) to the verify loop. It's
**off by default and zero-overhead when off** — the cross-model agent is only built when
the `orchestrate` skill passes `args.crossModel`, which it does only if
`~/.claude/fable-profile/xverify.json` enables it. Enable with `./install.sh
--with-xverify=openrouter` (or `=codex`); the installer prints the options with their costs.
The cross-model verdicts are **bonus coverage** — they never change the RED gate and must
never be the A/B eval judge. Full setup, cost, and the toggle: [`xverify.md`](xverify.md).

## Status

These recipes are **runnable and reviewed** — they compile as Workflow scripts, were
author-run via the Workflow tool during development (which is how the dogfood bugs were
found), and now have a **committed runtime smoke test** (`test/orchestration-runtime-test.js`,
in `npm test`) that EXECUTES `adversarial-verify` against contract-faithful stubs and
asserts the `parallel()` settle-to-null contract + the RED gate behavior. (The real
Workflow tool itself is exercised by author runs, not yet in CI.) Their *quantitative*
benefit is **not yet validated** — the eval harness
(`eval/`) and the premise-reproduction control (`eval/premise-control.md`) are how you
earn the right to claim a number. This layer is labeled experimental on purpose.
