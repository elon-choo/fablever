# Why Fable Orchestrates Better, and What Actually Transplants

## 1. The Question

We observed Fable spawn many more subagents than Opus inside ultracode on the same kind of work, and more broadly: Fable decomposes deeper, fans out wider, reviews more independently, diverges across more ideas, and loops until a problem space is exhausted. The question this report answers is **why** Fable orchestrates better and **what part of that edge actually transplants** into a Claude Code harness driven by an arbitrary worker model — versus what is bound to Fable's weights and cannot be ported by any amount of scaffolding.

The honest framing throughout is that scaffolding is a **multiplier on base competence, never a substitute**. The achievable ceiling is "closer to Fable," never "equal to Fable."

A premise caveat sits underneath the whole effort: the headline observation is a single uncontrolled anecdote. There is no record that Opus and Fable saw the same prompt, the same ultracode/effort setting, the same CLAUDE.md/skills/hooks context, or the same task. We validate the **transplant** rigorously below, but the **premise** itself (that Fable out-orchestrated Opus under matched harness conditions) is not yet validated and must be confirmed before the recipe library is justified. See Sections 6 and 7.

## 2. Method

The analysis was run as a structured, adversarial multi-stage process rather than a single pass:

- **6 expert personas, independent analysis.** Each examined the question from a distinct vantage: an internals researcher (transformer behavior), an adversarial skeptic, an evaluation scientist, an orchestration architect, a context practitioner, and a harness engineer. Each produced an independent read before seeing the others.
- **A debate round.** The personas exchanged and contested claims directly. Several disputes (the magnitude of the recoverable fraction, the divergence weights-vs-mechanism split) remained unresolved by argument alone and were explicitly marked contested.
- **A 3-arbiter dispute panel.** Three arbiter passes adjudicated the unresolved disputes. They adopted the practitioner's two-act split (decision vs construction), sided against the orchestration architect's "almost entirely architecture" overclaim, won the green/red gate asymmetry, and in every pass marked the magnitude UNVERIFIED — forbidding any quantified claim before the experiment runs.
- **A completeness critic.** A final pass audited for gaps, additions, overclaims, and source-fidelity errors. It produced a CONDITIONAL GO and five required reorderings/fixes (Sections 4, 5, 6).

Every load-bearing structural claim was **verified at source against the repo**, not asserted: the empty `skill/` directory, a repo-wide grep for orchestration primitives returning zero executable matches, the `SubagentStart` matcher, the restraint payload, the trait-drop in `RESEARCH.md`, and the four surface-only leaktest metrics.

## 3. Consensus on Why Fable Excelled at Orchestration

The central insight is that authoring orchestration is **two separable acts**: (a) the DECISION to spawn a workflow rather than answer inline, and (b) the CONSTRUCTION quality of the resulting agent graph. Most of the observed "spawned many more subagents" gap is act (a) — a learned routing default.

1. **Reaching for the Workflow tool by default.** Fable reaches for the Workflow tool where Opus satisfices with a strong inline answer. The bulk of the fan-out gap is this learned routing default, which is **context-recoverable** — ultracode already biases toward it, and a trigger can set it regardless of worker weights.

2. **Decomposition depth and fan-out width are a learned policy, not a knowledge fact.** At each step the model samples from competing high-level actions ("spawn 8 to explore 8 hypotheses" vs "just answer"). Fable's post-training shifted probability mass toward fan-out and toward emitting a plan before the first tool call. This prior lives in the weights, but for **known task genres** it reduces to recognition-against-a-fixed-menu of split-axes (by hypothesis / perspective / search-modality / pipeline-stage / file-module), which a weak model can do when handed the menu. Recognition is far more recoverable than open generation.

3. **Stronger independent review is mostly ARCHITECTURE, not reviewer brilliance.** A fresh-context skeptic with an empty window has no completion-attractor pull toward an answer that is not its own output, so it structurally cannot rubber-stamp the way a single model's in-thread self-review does. Fable reflexively separates generate from verify and assigns skeptics; that **separation** is the transplantable mechanism. The **depth** of any single refutation stays weights-bound.

4. **Wider idea divergence is largely mechanical.** Preference-optimization mode-collapse makes any single model in a single context return a few correlated modes. The divergence observed was Fable running MANY independent generations. N parallel contexts with harness-injected orthogonal lenses recover most of the apparent breadth by buying diversity through **independence** rather than base-policy entropy — but per-candidate idea quality remains capped by the worker's weights.

5. **Loop-until-dry exhaustiveness is a habit of not stopping early.** Transformers have a strong completion attractor that ends their own loops prematurely. Fable fights it more because its training rewarded the exhaustive trajectory. This is recoverable structurally **only if a deterministic JS counter — not the model — owns the termination decision.**

**Net honest split.** "Reaching for the tool" and "known-genre decomposition" are largely context-recoverable. Per-agent correctness, per-skeptic refutation depth, per-candidate idea quality, the correlated-blind-spot floor of same-family panels, and genuinely novel off-catalog graph design are weights-bound.

### The layer diagnosis

The most consequential finding: **the fable-profile attacks the wrong layer.** Orchestration lives in the deterministic Workflow-tool layer (agent / parallel / pipeline / barrier / schema / phase), not the output-style / system-prompt layer.

- Verified at source: `skill/` contains only `.` and `..`; a repo-wide grep over `*.js/*.md/*.sh/*.json` for `parallel( / pipeline( / agent( / judge-panel / loop-until / fan-out / adversarial-verify / barrier / orchestrat / decompos` returned **zero executable matches**. (The repo does ship `claude-code/subagent-brief.md`, but it is prose, not Workflow code — it does not change the verdict.)
- Root cause: `RESEARCH.md` (lines 93-94) discarded "parallel sub-agent delegation" as a non-portable *trait*. The capability should have **changed layers** — moved into the Workflow tool — not been dropped.
- Worse than orthogonal, the shipped artifact is **actively counterproductive**: the `SubagentStart` hook injects a restraint payload into every spawned subagent (matcher `'*'`, `settings-merge.js` line 72; `fable-subagent.js` lines 26-36). That payload instructs leaves to do "no...validation beyond what the task needs" and "report your findings and stop" — a per-leaf instruction to under-validate and stop early, directly suppressing fan-out and verification depth. (Precision notes: the hook injects whichever of `['compact','core']` exists first, which on a default install is `compact.md`; and the payload is one **mixed** paragraph that also contains pro-rigor grounding lines — the net effect is restraint-leaning, so the counterproductivity claim survives, but it is not a pure anti-verification instruction.)

## 4. What Transplants — The Prioritized Design

Each item below maps to a concrete Claude Code mechanism. Priorities reflect leverage and portability; the build-order **reordering** required by the completeness critic is stated in Section 6.

### P0 — The spine

**adversarial-verify Workflow recipe (the first build).**
A parameterized, executable Workflow JS template: spawn N fresh-context skeptics via `agent({agentType, schema})`, each in its own empty context, each handed ONLY the artifact-under-review and a distinct lens, each forced to return `{refuted: bool, evidence: string, lens: string}`. A `parallel()` **barrier** awaits all; a synthesis step merges verdicts. Reuse calibrated judge agentTypes (`red-team-validator`, `evidence-verifier`, `purple-team-arbiter`) rather than re-inventing skeptics. Record the final verdict through `adversarial-review` / `dod-catalog` rubric IDs to satisfy the verdict-recording routing rule.
*Why:* highest-leverage, cleanest, most model-portable transplant. Context-isolation defeats the completion attractor that makes in-thread self-review rubber-stamp; independence transplants in full even with weaker skeptics for contradiction/omission defects. This is the part of Fable's edge that is architecture, not weights.
*CC mechanism:* **Workflow tool** — `agent(prompt, {agentType, schema})` for fresh-context schema-forced skeptics; `parallel(thunks)` with its barrier; existing **custom agent types**; `adversarial-review` + `dod-catalog` **skills** for verdict bookkeeping.

**RED output-gate on load-bearing delivery.**
A deterministic JS assertion inside the Workflow: a workflow may not close its final `phase()` until ≥1 fresh-context verification agent has returned a schema-valid verdict with a non-empty findings field. It inspects produced STATE, not the model's intent, is logged in the run log, and is scoped behind a complexity floor (mirroring the profile's own "skip ceremony on trivial one-liners").
*Why:* the honest version of the deterministic gate argument. It starts the hesitant model (delivery blocked until review ran) and stops the reckless one (no unreviewed load-bearing delivery) without policing initiative. **Caveat (corrected from the original framing):** this gate is ungameable by the *delivering leaf* but **gameable by the *spawning orchestrator***, which can satisfy the existence check with a single hollow rubber-stamp skeptic. Honest phrasing: "cannot be passed without SOME fresh-context verification having run, but runtime cannot certify the verification was adversarial — that is offline-only." This requires the gate-integrity fixture in Section 6.
*CC mechanism:* **Workflow tool** — `phase()` boundaries, the token-budget/state object, schema-forced agent output validated in deterministic JS. The gate is plain JS in the workflow script, not a prose rule.

**SubagentStart hook exemption for orchestration agentTypes.**
Stop injecting the restraint governor (`compact.md`) into orchestration workers. Add a settings-level matcher exemption (or a payload guard keyed on agentType) so skeptic/searcher/synthesizer agents do NOT receive "report findings and stop / no validation beyond what the task needs." Do NOT repurpose the hook to inject role briefs — it is role-blind and static; role briefs belong in the `agent()` call.
*Why:* verified-at-source counterproductivity. The fix must be a deterministic settings-level exemption, not a runtime "don't co-load" decision the model can fumble.
*CC mechanism:* **hooks** — `settings.json` `SubagentStart` matcher scoping (currently `'*'` in `settings-merge.js` line 72); per-agentType matchers; the `agent(prompt, opts)` prompt argument as the correct surface for per-role briefs.

**Seeded-defect eval fixture + pre-registered A/B harness.**
Co-designed with the adversarial-verify recipe. A frozen task suite with planted defects stratified into (a) contradiction/consistency, (b) omission/coverage, (c) deep-reasoning correctness, plus a divergent stratum scored as recall against a pre-registered REFERENCE SET of valid distinct approaches. Hold the worker model fixed; toggle the STRUCTURE (single mega-agent vs decomposed+parallel+verify). Independent judge BLIND to condition (never the fusion sibling-model — that leaks the treatment). Track cost. Decision rule fixed before condition B runs; null result falsifies the templates.
*CC mechanism:* **Workflow tool** to run both arms; `agent({model})` override to swap the worker model; the existing leaktest harness pattern repurposed to log OUTCOME metrics (defect-catch by stratum, reference-set recall) plus cost denominators.

### P1 — Breadth and planning

**divergent-explore Workflow recipe.**
N parallel fresh contexts, each handed a harness-authored named anti-overlap lens (not relying on temperature), schema-forced hypothesis output, loop-until-dry termination where a deterministic JS counter — not the model — decides "dry" after K empty rounds; then a synthesis/judge step. Width gated on the count of detected independent targets, capped at `min(16, cores-2)`, behind a complexity floor.
*Why:* recovers the SPREAD of Fable's divergence by buying diversity through independence (defeats mode-collapse) and JS-owned termination (defeats the completion attractor). Per-idea quality stays weights-capped — **claim breadth, not quality.** (See the overclaim note in Section 5: breadth-recovery is itself contingent on a specified lens library.)
*CC mechanism:* **Workflow tool** — `parallel(thunks)` with barrier; `agent({schema})`; the token-budget object and a JS counter for loop-until-dry; concurrency cap `min(16, cores-2)` and the 1000-agent lifetime.

**decompose-first typed task-tree artifact.**
A forced gate requiring the model to emit a typed task-tree (which known split-axis applies, how many independent sub-problems) BEFORE any spawn is permitted. Fan-out width is then conditioned on the COUNT of independent sub-problems the tree contains, with a complexity floor that exempts trivial tasks. It forces the PLAN to exist, not N agents to spawn.
*Why:* converts decomposition from generation-under-load into classification-against-a-menu — recognition is far more recoverable on weak models, and it defeats the completion-attractor rush to answer before planning.
*CC mechanism:* **Workflow tool** — a `phase()` that produces a schema-forced task-tree artifact validated in JS before any `agent()`/`parallel()` spawn; width keyed to the artifact's independent-target count.

**Orchestration recipe library + triggered Skill.**
A token-lean Skill that owns a task-shape → Workflow-primitive decision table and indexes parameterized recipes (adversarial-verify, divergent-explore, judge-panel, completeness-critic, perspective-diverse-verify, pipeline-map). Params only: `n, lenses, agentType, schema, untilDryRounds`. PULLED on a matching trigger, never prepended always-on. The model fills a fixed skeleton; it does not author architecture.
*Why:* architecture in context, content from the model — the precise transplant. Recipes are real programs (real barrier, real schema validation, real gates), which is why they survive the placebo objections that sink prose. Triggered-and-fetched avoids token bloat and conflict with the strong internal harness. Raises the floor most for Sonnet/Haiku.
*CC mechanism:* **Skills** (invokable procedures, pulled on trigger); the **Workflow tool** primitives the recipes instantiate; the decision table maps task-shape to `parallel()` vs `pipeline()` vs `judge-panel`.

### P2 — Gated and optional

**judge-panel recipe for high-stakes single artifacts.**
N independent attempts at the same high-stakes artifact, each scored against a fixed `dod-catalog` rubric, then synthesized. Gated to high-stakes single artifacts ONLY via the decision table; cost bounded by the `min(16, cores-2)` cap.
*CC mechanism:* **Workflow tool** — `parallel(thunks)` for independent attempts + a synthesis `agent()`; `agent({schema})` for forced rubric scores; `dod-catalog` rubric IDs.

**Fusion MCP re-scoped as fenced optional escalation.**
Keep the existing zero-dep, off-by-default fusion MCP as a fenced, opt-in research/escalation tool ONLY. For any VERIFICATION use it must run `fable_style:false` (the current default `true` re-steers the "independent" panel with the Fable style, contaminating the independence it sells). It must never carry secrets or production data through the third-party OpenRouter proxy without explicit per-use consent, and it must **never be the judge in the orchestration A/B** (sibling-model judging leaks the treatment).
*Why:* it has a legitimate kernel — genuinely different-weights models (Opus + GPT + Gemini) decorrelate the correlated-blind-spot floor that same-family in-house panels cannot attack. But it is orthogonal to the in-Workflow deliverable, it is a network/supply-chain surface, and it is disqualified as an eval judge. Supply-chain audit passes (zero npm deps, no postinstall/prepare, off-by-default, explicit key, inspectable plain fetch).
*CC mechanism:* **MCP server** (`fusion-server.js`, zero-dep, built-in fetch); `OPENROUTER_API_KEY` gating; `FABLE_FUSION=off` toggle; the `fable_style` tool parameter set to `false` for verification use.

### Gap-fillers required by the completeness critic (P1-class)

**A pipeline/no-barrier recipe.** The decision table references `pipeline()` but no recipe instantiates it. Add one map-stage recipe instantiating `pipeline(items, ...stages)` for the common "process each of N items through staged extract→transform→verify with no global barrier" shape, with the same schema-forcing and per-stage gate discipline as the parallel recipes. Map-heavy staged work is one of the most common real orchestration genres.

**Latency + hard-agent-ceiling denominators.** Add wall-clock-to-first-useful-output to tracked denominators, and give every loop-until-dry recipe a deterministic MAX-rounds / max-total-agents ceiling in the JS counter — not only the K-empty-rounds dry-stop. A dry-stop without a hard ceiling can walk loop-until-dry toward the 1000-agent lifetime cap on a deep task; `parallel()` blocks on the slowest skeptic, so for interactive coding latency can dominate token cost.

## 5. What Was Rejected and Why

Each rejection is a **binding guardrail.**

- **Prose imperatives to "orchestrate like Fable / spawn more subagents / diverge more" via output style or system prompt — PLACEBO.** Style instructions bias surface form, not pre-token control flow. `RESEARCH.md` sensed this but drew the wrong conclusion (drop the trait) instead of relocating it into the Workflow layer. Orchestration is executed control flow, not token style.

- **Naive count quotas ("spawn N agents", "give 2-3 ideas") without a goal, schema, or stopping rule — REWARD-HACKING.** The model splits one good answer into N worse fragments to satisfy the count, or pads with near-duplicates — worse output at higher token cost. Breadth must be conditioned on detected independent sub-problems, never a flat quota.

- **"Act when you have enough info / stop when done" as the orchestration governor — REWARD-HACKING.** The model just-asks or just-executes to satisfy the rule. As shipped in `compact.md` it is injected into every subagent and instructs leaves to under-validate and stop early — the opposite of the mandate. The deterministic decision belongs in JS-owned counters and output gates, not unfalsifiable prose.

- **N skeptics sharing the original context window, or "review carefully" as a prose self-review rule — THEATER.** If the verifier sees the original answer, the completion attractor re-applies and it rubber-stamps. The mechanism requires fresh/empty context per skeptic.

- **Blind fan-out (K=16 on every task) or agent count as a success metric — TOKEN-WASTE + non-discriminating.** It burns the concurrency cap and token budget on tasks needing one agent. Agent count rises both when the model games the gate and when it genuinely helps, so it **cannot discriminate the two.** Width must be per-recipe, shape-gated, behind a complexity floor; agent count is a **cost denominator only.**

- **Repurposing the SubagentStart hook to inject per-role briefs — ARCHITECTURE ERROR.** The hook fires on every spawn with a static, role-blind payload; it cannot know whether a leaf is a skeptic, searcher, or synthesizer, and there is no X in its context to refute. Per-role briefs belong in the `agent(prompt)` call. The hook's only honest orchestration job is a settings-level OFF for orchestration agentTypes.

- **A GREEN deterministic gate that COMPELS workflow-authoring on a trigger-phrase match — INITIATIVE-POLICING + HARNESS-CONFLICT.** This is the **deterministic traffic-light-gate argument**, applied **asymmetrically**: RED gates that assert on PRODUCED OUTPUTS are deterministic and (leaf-)ungameable — they inspect state, not intent, and a hesitant model loses nothing by proceeding once review passes. GREEN gates that COMPEL authoring on a trigger phrase **police INITIATIVE**, re-import forced-routing side effects (the user's own stance) and objection-3 reward-hacking (the model authors a token-workflow with padding agents to satisfy the green light). Output-policing is honest; initiative-policing is not. Keep green **suggestion-only behind a complexity floor.**

- **Generalizing the existing adversarial-review skill as-is (routing execution through it).** It orchestrates via SEQUENTIAL, main-session-driven prose dispatch (`SKILL.md` red→blue→red→purple steps run in the main thread), not via the Workflow tool's `parallel()` barrier — keeping reviewers in/near the driver's context and re-importing the very anchoring fresh-context spawning is meant to defeat. Reuse its calibrated JUDGES and record verdicts through it, but REWRITE the driver as barrier-synchronized Workflow code.

- **Treating the fable-leaktest (or "workflow ran without error" smoke tests) as validation — CATEGORY ERROR.** The leaktest measures four surface-style proxies (median words/msg, tool:text ratio, caveat%, opener%) its own header disclaims as "not a measure of correctness"; smoke tests verify plumbing, not answer quality. A greener leaktest column proves nothing about defect-catch rate. (Line-number precision: the disclaimer prints at ~line 131 and the stronger header disclaimer at lines 21-23; the substance is fully verified.)

- **Embedding-distance dedup as the divergence SUCCESS metric, or a single planted optimum as the divergent-stratum ground truth.** Embedding-distant noise still passes a distance threshold — distinctness is a **cost-side tripwire, not a value proxy** (two distant ideas can both be worthless), and rewarding "distinct" re-creates the agent-count vanity metric one level up. A single hidden optimum mis-measures a divergence task as a search task. The success numerator must be judge-scored recall against a pre-registered reference SET.

- **Using the fusion MCP as the judge in the A/B, or making it any default path — TREATMENT LEAK.** A related model judging its own ecosystem's experiment inflates scores and contaminates the independent-blind-judge requirement; it also routes prompts and an API-key surface through a third-party proxy. Legitimate as a fenced escalation tool with `fable_style:false`; forbidden as an eval judge or a default.

### Two honest corrections to our own claims

- **The RED gate is over-sold as "ungameable."** It is leaf-ungameable but orchestrator-gameable (a hollow rubber-stamp skeptic satisfies the existence check). At runtime it is, by the plan's own runtime-vs-offline split, only a plumbing check. It needs the gate-integrity fixture (Section 6).
- **Divergence breadth-recovery is less safe than stated.** It is treated as the "safe half" and per-idea quality as the contested half, but breadth-recovery is **contingent on an unspecified anti-overlap lens library.** If lens SELECTION itself requires open generation on a weak model, the recognition-not-generation advantage evaporates and breadth-recovery weakens. The lens library must be specified (Section 7).

## 6. Measurement Plan

**Build order (reordered per the CONDITIONAL GO).** Two cheap controls become **hard predecessors** to any recipe measurement:

0. **Premise-reproduction control — position zero.** Before building any recipe, re-run the ORIGINAL task with Opus in ultracode AND the same CLAUDE.md/skills/hooks context Fable had; record whether the fan-out/divergence/review gap reproduces under matched harness conditions, and log the agent-graph each produced. The entire effort rests on one uncontrolled observation; if the gap was partly a harness-setting confound, the "recoverable fraction" is being measured against a phantom. This is hours, not weeks — a strictly cheaper falsifier than the full A/B.
1. **Hook-exemption as a HARD PREDECESSOR, not a parallel P0.** The `SubagentStart` matcher exemption must land and be verified BEFORE the first adversarial-verify recipe is executed for measurement. Add a one-line assertion to the recipe harness: refuse to run if any spawned orchestration agentType would receive the `compact.md` payload. Otherwise condition B's very first measurement is contaminated by the restraint payload at the leaf, biasing the result toward "structure didn't help."
2. **Co-design the first recipe (adversarial-verify) WITH its verdict schema and the seeded-defect fixture together** — the defect schema and verdict schema are mutually specifying, so the eval harness is a co-requisite of the first artifact, not a strict predecessor. But **no claim ships without the pre-registered A/B.**

**The A/B protocol:**

- **Pre-register before condition B runs:** the frozen task suite, the rubric, the independent condition-blind judge, the primary proxy, and the decision rule (e.g. ≥X-point catch-rate gain at ≤Y% cost increase, replicated, paired-test across tasks). No post-hoc metric selection.
- **Stratify by defect type** — (a) contradiction/consistency, (b) omission/coverage, (c) deep-reasoning correctness — and **report per-stratum.** Independence dominates (a)/(b); the weights ceiling binds on (c). Lumping them would silently generalize a verification win into a false claim about deep correctness.
- **Stratify by task novelty** (in-catalog vs out-of-catalog genres) to size how much the recipe library lifts Sonnet/Haiku vs Opus, and to bound the off-catalog weights residual.
- **For the divergent stratum,** score recall against a PRE-REGISTERED reference SET of valid distinct approaches (curated by a human or strong-model panel before the run) — never a single planted optimum, never embedding-distance dedup.
- **Ablate STRUCTURE with the worker model held FIXED:** single mega-agent vs decomposed+parallel+verify, run across Opus, Sonnet, and Haiku as worker. **The discriminator between real scaffolding and placebo is the inversion: structure-driven gains PERSIST under a worker-model swap; prose-driven gains vanish on toggle.** That inversion is the honest answer to the placebo objection.
- **Judge must be INDEPENDENT and BLIND to condition.** Never the orchestration model, a sibling in the same workflow, or the fusion cross-model panel (all leak the treatment).
- **Track cost alongside quality:** quality-per-task, quality-per-1k-tokens, quality-per-agent, **and wall-clock-to-first-useful-output.** Agent count, fan-out width, and gates-fired go on the run log ONLY as cost denominators and reward-hack tripwires, never as the headline. An upgrade that doubles agents for a 5% quality gain is a cost regression.
- **decompose-first complexity-floor test:** does the gate raise decomposition coverage WITHOUT inflating agent count on simple tasks? A null here kills the gate.
- **Gate-integrity fixture (closes the RED-gate hole):** seed a fixture where the artifact contains a planted defect and verify the gate's runtime pass/fail does NOT false-pass via a degenerate single rubber-stamp skeptic. If the orchestrator can pass the gate with a token-skeptic, score that as a gate failure.
- **Runtime vs offline split for verification:** at runtime gate only on the cheap deterministic signal (a fresh-context skeptic ran AND returned a schema-valid verdict with a non-empty findings field); score refutation EVIDENCE QUALITY only OFFLINE in the pre-registered benchmark. Never put a model-judge of evidence quality in the runtime loop.
- **Allow null results to falsify:** if a recipe shows no judge-scored gain on a ground-truth proxy at non-degraded cost, drop it. Ship no orchestration claim until the harness shows a replicated, judge-scored gain at non-degraded cost.
- **Relabel the leaktest** in the repo plainly as a surface-style proxy that measures neither orchestration nor correctness, and decouple it from the orchestration mandate; never co-load it with orchestration workers.

**Direction now, magnitude later.** The three transplant mechanisms — context-isolation defeats the completion attractor, parallel+injected-lenses defeats mode-collapse, deterministic-JS termination defeats early-stop — are identifiable from known transformer behavior and license **choosing what to build.** They do NOT license quoting a recovered-fraction number before the A/B.

## 7. Open Questions

- **Magnitude of the recoverable fraction overall, and the weights-vs-mechanism split on DIVERGENCE.** Contested: internals/practitioner predict a large recoverable spread; skeptic/evaluation-scientist predict per-candidate quality caps it hard. Only the stratified A/B on reference-set recall under matched compute settles it. No number may be quoted before then.
- **Size of the correlated-blind-spot floor** for same-family panels on deep-correctness (type-c) defects — how much in-house parallel skeptics miss that only genuinely-different weights (cross-model fusion) could catch. Measurable as the gap between a weak-panel catch rate and a strong-single-reviewer catch rate on subtle (vs contradiction-type) defects.
- **Whether a deterministic complexity floor can be specified tightly enough** to make even suggestion-only green routing safe, or whether any initiative-side gate over-triggers cheap tasks. Resolvable only by the A/B cost axis per task genre.
- **Whether deep-research's fan-out is a REAL `parallel()` barrier or sequential `agent()` calls** — determines whether it is a reusable seed for the genre templates or another sequential driver to rewrite. Must be verified before reuse.
- **The exact mechanism for a per-agentType `SubagentStart` exemption:** `settings.json` matcher scoping vs a payload guard keyed on agentType. Today the hook installs with matcher `'*'` and only all-or-nothing `--no-subagent` exists; the precise scoping surface needs confirmation against the live harness. (Note: the hook injects whichever of `['compact','core']` exists first — implement the exemption against the fallback chain, not a hardcoded filename.)
- **For Opus specifically, how much the recipe library lifts beyond ultracode's built-in workflow-authoring disposition.** The single-mega-agent-vs-decomposed arm on Opus answers this; the prior is "less than for Sonnet/Haiku but non-zero on calibration."
- **Whether to additionally trim the behavioral `full.md`** to the one paragraph that survives an on/off OUTCOME test — owner's scope decision, not an engineering ruling. The engineering ruling is only: decouple from orchestration, relabel the leaktest, exempt orchestration workers. The behavioral profile is a legitimate **separate single-agent restraint product** but is **unvalidated for outcomes**; it must be relabeled and never co-loaded with orchestration workers.
- **The cost/latency threshold and quality-per-1k-token decision rule** that make judge-panel and best-of-N spend defensible. Until pre-registered, "gated to high-stakes" is itself a vibe.
- **The genuinely-novel off-catalog decomposition residual** — how often real tasks actually fall off the documented split-axis menu. Assumed rare ("rarer than failed-to-plan-because-it-rushed") but unmeasured; the in-catalog vs out-of-catalog stratification produces the number.
- **The anti-overlap lens library specification** (added — load-bearing, was not even in the original open questions). Where do the lenses come from? Are they task-generic or task-specific? Who authors them, and how does a weak model pick the right lens set? If lens SELECTION is itself open generation, the recognition-not-generation advantage evaporates for divergence and the breadth-recovery claim weakens. This is the single biggest under-specified surface in the divergence claim.

---

**Verdict: CONDITIONAL GO.** Build the P0 spine, but reorder and add the cheap controls first. The diagnosis is verified at source and the layer conclusion (orchestration lives in the Workflow tool, not the output style) is justified. Readiness is gated on five fixes, none requiring new research: (1) run the premise-reproduction control FIRST; (2) make the hook-exemption a HARD PREDECESSOR to the first recipe measurement; (3) stop calling the RED gate "ungameable" and add the gate-integrity fixture; (4) add latency and a hard agent-ceiling as deterministic denominators; (5) specify the anti-overlap lens library. Also add one pipeline/no-barrier recipe. Build adversarial-verify + its seeded-defect fixture + the hook exemption as the first slice and let the stratified, model-swap-aware, condition-blind A/B falsify it. Ship no orchestration claim — and trim no behavioral `full.md` — until that A/B shows a replicated judge-scored gain at non-degraded cost. The rejected-ideas list is binding.
