# The optimal fablever stack, per host — the decision and the evidence

**One axis only.** This document answers a single question: *for a real Claude Code or Codex user doing
vibe-coding / automation, what is the configuration that most helps them get work done well and get better
results* — not what has the most features, the most stars, or the biggest surface. Everything below is
graded on productivity / satisfaction / better outcomes, and nothing else.

**The short answer.** fablever's measured value lives almost entirely in **one lean instruction layer**
(the output style on Claude Code, `AGENTS.md` on Codex). Every other surface — MCP tools, lifecycle hooks,
skills, cross-model review — earns its place only when it is *zero-always-on-cost* (pulled on demand) or
*deterministic enforcement of an already-validated rule*. So the optimal stack is **the instruction layer
reaching every surface, plus on-demand skills that cost nothing until used, plus (opt-in) one deterministic
stop-gate — and nothing else by default.** That is now what the installer ships.

---

## 1. The evidence this rests on

Two independent bodies of evidence — our own billed A/Bs and the only rigorous public studies — point at the
same conclusion.

**Our measurements (recompute offline; see [`EVALS.md`](../EVALS.md)):**
- **Scope discipline (Claude Code):** the style holds scope at **0% violations vs plain Claude's 42%**, and a
  naive "be concise" prompt *backfires* (1–14 vs plain). The instruction layer is the lever.
  → [`eval/style-only-ablation/`](../eval/style-only-ablation/RESULTS.md)
- **Action bias (Codex `exec`):** handed already-correct code and a *false* bug report, plain Codex rewrites
  the correct code **~80%** of the time; the `AGENTS.md` instruction layer roughly **halves it to ~43%**,
  significant on **10/10 independent tasks** (task-level sign test p=0.002).
  → [`eval/codex-native-ab/RESULTS-confirmatory.md`](../eval/codex-native-ab/RESULTS-confirmatory.md)
- **The honest nulls beyond the instruction layer:** the full stack does **not** beat instruction-only
  (Codex action-bias S=47% vs A=43%); a strong model under one-shot `exec` self-invoked an MCP tool in only
  **1/60** runs; the delivery gate adds **0** completeness over style-only on multi-step tasks; cross-model
  review adds **0** defect recall. We publish these. The marginal value of capability *beyond* the
  instruction layer, on a strong model, is approximately nil.

**The only rigorous external studies — both corroborate the thesis:**
- **ETH Zürich, AGENTbench** (Gloaguen et al., [arXiv:2602.11988](https://arxiv.org/abs/2602.11988)):
  across 138 repos and 4 agents (incl. Codex), context files generally do **not** raise success rate and add
  **~+20% reasoning cost**; a human-written file helps only **+4%, and only when minimal and precise**;
  LLM-generated/verbose context *lowers* success. The lever is the lean instruction text; bulk is a tax.
- **AGENTS.md efficiency study** ([arXiv:2601.20404](https://arxiv.org/html/2601.20404v2),
  [dair.ai summary](https://academy.dair.ai/blog/agents-md-evaluation)): a lean, non-redundant, human-written
  context file cuts tokens ~16–20% and time ~28%; auto-generated/verbose context costs more and helps less.

The convergence is the point: **a lean instruction layer is the one thing with rigorous evidence behind it,
and capability bundles are a measured cost with no outcome evidence.** fablever was already built on this; the
external work raises it from "our finding" to "the field's best evidence."

---

## 2. The optimal stack, per host

### Claude Code (interactive vibe-coding) — `node install.mjs` (the default)

| layer | in the optimal stack? | why |
|---|---|---|
| **always-on output style** (the discipline text) | **yes — the core** | the proven lever (scope 0% vs 42%). Reaches the main agent every turn. |
| **SubagentStart reach** | **yes** | a subagent doesn't inherit the output style; this is the one hook with a real mechanism — it carries the same discipline into every spawned subagent, where over-build and scope errors compound. |
| **on-demand Agent Skills** (`fable-seed`, `fable-plan`, `fable-handoff`, `orchestrate`) | **yes (new)** | A/B-validated lift (auto-seed 33%→89% convention adherence; plan-first 9–1 on hard tasks) at **zero always-on token cost** — a skill is inert until the model pulls it. This is capability that survives the "cost-tax" critique. |
| **`fable_check` / `fable_lint` (MCP)** | **available, opt-in tool** | the delivery gate beats shipping an unchecked first draft 27–0, but a strong model rarely self-invokes it. Kept available; not the load-bearing part. |
| **stop-gate** (`--with-stop-gate`) | **opt-in (new)** | compiles the validated unsupported-done-claim rule into a deterministic Stop hook so it fires without self-invocation — closing fablever's one measured cost (more unsupported "it works" claims, 8.3% vs 2.1%). One nudge, never loops, fails open. |
| operational hooks (onboard / model-check / update-check) | present, opt-out | conveniences, not discipline; one anonymous version ping is the whole network footprint. |
| xverify / fusion | **opt-in, high-stakes only** | 0 added defect recall on a strong model; reserve for judgment review. |

**The minimal proven core** is still `--no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp`
(style-only): lowest surface, carries the robust scope-discipline evidence, no skills, no hooks, no network.

### Codex CLI (automation / `codex exec`) — `node install.mjs --codex-style-only`

| layer | in the optimal stack? | why |
|---|---|---|
| **`AGENTS.md` instruction layer** | **yes — and essentially the whole win** | the action-bias halving (80%→43%) is driven by this text; it is also one of the few surfaces that loads in a fresh, untrusted `codex exec` workspace. |
| **on-demand Agent Skills** | available in `--codex-full` | validated + zero-cost when pulled, but a strong model under one-shot `exec` rarely reaches for them. |
| **MCP tools / lifecycle hooks** | **not worth the default** | under `codex exec` hooks never fire (no SessionStart event) and project `.codex/` is not loaded; MCP activates only via top-priority `-c` injection, and even then the model self-invokes ~1/60. Measured marginal value ≈ 0. |
| **enforcement** | **the sandbox / approval policy** | the external evidence is explicit — *enforce with the toolchain, not prose.* `--sandbox` and the approval policy are stronger scope guarantees than any instruction, and fablever never weakens them. |

For Codex automation, the leanest mode (`--codex-style-only`) captures essentially all the measured value;
`--codex-full` is for interactive Codex users who want the tools, and is honestly bounded.

---

## 3. What this redefinition changed

- **Wired the validated on-demand skills into Claude Code.** `claude-code/skills/*` existed but the installer
  never delivered them; now the default install copies them to `~/.claude/skills/` behind a `.fable-skill`
  ownership marker, so uninstall removes only ours and a user-authored skill of the same name is never
  touched. Suppressed under style-only and `--no-skills`. (`test/skills-install-test.mjs`, 13/13)
- **Shipped the plan-first technique** as an on-demand `fable-plan` skill for both hosts — trigger-gated to
  hard multi-step work (its measured win), a no-op on simple tasks (its measured non-win).
- **Added the opt-in deterministic stop-gate** — the evidence-favored "enforce, don't just instruct" move,
  enforcing the already-regression-tested lint rule with byte-identical regexes, one nudge, never loops,
  fails open. (`test/stopgate-test.mjs`, 17/17.) Replaying the frozen rule over **360 real Codex final
  messages** from the action-bias/discipline runs trips it **0/360** — i.e. zero false positives on outputs
  that are already grounded (it never nags a well-cited reply), and zero catch where a strong model is
  already disciplined. Its catch is therefore **workload-dependent**: it fires on the unsupported-claim-prone
  setting the style-only ablation measured (8.3%), and is silently inert otherwise.
- **Aligned the default with the optimal stack** and kept every guarantee: install/uninstall reversibility
  140/140, privacy 16/16, zero dependencies.

---

## 4. Why this beats the alternative harnesses (on the one axis)

A survey of the most-rallied-behind Claude Code and Codex harnesses (SuperClaude ~22k★, claude-flow,
BMAD-METHOD, Agent OS, GitHub spec-kit, Archon, codex-settings, and the AGENTS.md template ecosystems):

- **None has rigorous evidence of beating "plain agent + a good, lean, human-written context file"** on real
  outcomes. Their headline numbers (e.g. "2–3× faster", "84.8% SWE-bench") are self-reported, popularity, or
  unreproducible — and SWE-bench scaffold scores are known to swing several points on harness changes alone.
- **They are mostly capability/orchestration accretion** — exactly the bulk the ETH and dair.ai studies
  measured as a **+14–22% cost with no success-rate gain**. SuperClaude's own author declines to verify its
  numbers; its base prompt is a multi-thousand-token tax.
- **The discipline niche is essentially unmeasured by anyone else.** The nearest competitors are anecdotal
  patterns (closure/escalation rules, `developer_instructions` aliases) and the community consensus that
  *deterministic hooks beat trusting an instruction file.* fablever's quantified action-bias result is close
  to the only public number of its kind, and the stop-gate is exactly the "compile discipline into a
  deterministic hook" that consensus endorses.
- **fablever's real differentiators on this axis** are (a) it ships only what it measured and **publishes its
  own nulls and costs** — the opposite of the field's unverified headline numbers; (b) it is **lean and
  enforcement-first**, matching the only rigorous evidence, instead of bulk-and-capability which that
  evidence penalizes; (c) it adds capability **only** at zero always-on cost (on-demand) or as deterministic
  enforcement of a validated rule.

**The honest gaps — where discipline is the wrong tool and we make no claim:**
- **Throughput on parallelizable work** (large multi-file refactors, batch migrations): worktree/swarm
  harnesses win on wall-clock; restraint does not buy parallelism.
- **Cost routing** (multi-model routers): a real, measurable, *orthogonal* win discipline can't give.
- **Long multi-session memory** (spec/ADR/journal persistence): structural context-loss problems prose can't
  solve. fablever's `fable-handoff`/`fable-seed` only dent this.
- **Independent verification / best-of-N:** catching errors a single restrained pass misses is orchestration,
  not discipline (fablever's xverify/orchestration layer is opt-in and separately bounded).
- **The capability-bound regime:** on genuinely hard problems where the bottleneck is the model's reasoning or
  missing domain knowledge, a well-built scaffold can beat a too-lean agent. fablever raises no reasoning
  ceiling — by design.
- **The one unmeasured bet:** whether the always-on layer *helps or costs* a long real session is the
  "harness paradox," still not measured. The stop-gate's net long-session value is therefore a *mechanism
  aligned with the evidence*, not a *claimed* productivity gain — measurable via the opt-in holdout campaign
  (`measurement/`), and not asserted until it produces a positive signal.

---

## 5. Verify it yourself

```bash
npm test                                   # reversibility 140/140, privacy 16/16, skills 13/13, stop-gate 17/17, +rest
node install.mjs --dry-run                 # see the exact default Claude Code stack (incl. on-demand skills)
node install.mjs --with-stop-gate --dry-run
node install.mjs --codex-style-only --dry-run   # the Codex automation optimum
cat eval/codex-native-ab/RESULTS-confirmatory.md  # the action-bias measurement
cat EVALS.md                               # every claim, every null, and the file that recomputes it
```
