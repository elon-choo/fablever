# Proposal: exempt orchestration workers from the restraint payload

**Status: APPLIED 2026-06-15 (Option A, with owner approval).** `claude-code/hooks/fable-subagent.js`
now reads the SubagentStart event and skips the restraint payload for orchestration agentTypes
(fail-open, with an `isTTY` guard so it can never block a spawn). The change was verified in
isolation (exempt types → no injection; normal types → injection unchanged; `FABLE_PROFILE=off`
→ no injection) and copied to the live `~/.claude/hooks/`. This document is retained as the
rationale and the exact diff. Option B below remains an alternative for matcher-based setups.

## The problem (verified at source)

`fable-subagent.js` fires on **every** subagent spawn (`settings-merge.js:72` sets
`matcher: '*'`) and injects the compact governor — a **restraint-leaning** paragraph
("report your findings and stop", "no…validation beyond what the task needs"). For a
normal single subagent that is the intended Fable behavior. But for an **orchestration
worker** — a skeptic that is supposed to dig exhaustively, an explorer that is
supposed to diverge — it is backwards: it tells the very agents the recipes spawn to
under-validate and stop early, suppressing fan-out and verification depth. The
completeness critic made this a **hard predecessor** to clean measurement.

The recipes already neutralize it at the **prompt layer** (each skeptic prompt begins
with an explicit override). That makes the shipped recipes work. This proposal is the
**clean, deterministic** fix so the contamination is gone at the source and the eval
arm B is not biased.

## Option A (recommended): payload guard keyed on agentType

Make the hook read the spawn event on stdin and skip injection for orchestration
agentTypes. Fully reversible, no settings surgery, default behavior for ordinary
subagents unchanged.

```js
// fable-subagent.js — after the FABLE_PROFILE/OFF checks, before reading the variant:
//   Orchestration workers should NOT get the restraint governor.
const EXEMPT = new Set(['red-team-validator','evidence-verifier','purple-team-arbiter']);
const EXEMPT_RE = /skeptic|refut|verify|explore|diverge|search|orchestrat/i;
try {
  let raw = ''; try { raw = require('fs').readFileSync(0, 'utf8'); } catch (_) {}
  if (raw) {
    const ev = JSON.parse(raw);
    const t = ev.subagent_type || ev.agentType || (ev.hookSpecificOutput && ev.hookSpecificOutput.subagentType) || '';
    if (t && (EXEMPT.has(t) || EXEMPT_RE.test(t))) process.exit(0); // no injection for workers
  }
} catch (_) { /* fall through: inject as before */ }
```

> Note: the exact field name for the spawned agent's type on the `SubagentStart`
> payload must be confirmed against the live harness (open question in
> `docs/ORCHESTRATION-RESEARCH.md` §7). The code above checks the likely aliases and
> **fails open** (injects as today) if it can't tell — so it can never block a spawn.

## Option B: settings-level matcher scoping

Instead of `matcher: '*'`, register the hook with a matcher that excludes the
orchestration agentTypes (or register a second no-op entry for them). This keeps the
hook itself untouched but depends on how the installed Claude Code version matches
`SubagentStart` matchers — needs the same live-harness confirmation.

## What NOT to do (binding)

Do **not** repurpose this hook to inject *role briefs* ("you are a skeptic, refute
X"). The hook is role-blind and static — it cannot know a leaf's job and there is no
artifact in its context to refer to. Per-role briefs belong in the `agent(prompt)`
call, where the recipe knows each worker's role. The hook's only honest orchestration
job is to **stop injecting** into workers.

## Reversibility

Both options are guarded and fail-open (any error → inject as today → never blocks a
spawn). Option A is a localized addition to one file; revert by deleting the block.
`settings.json` is still backed up before any change by `settings-merge.js`.

## Recommendation

Apply **Option A** once the `SubagentStart` agentType field is confirmed on this
machine, and add the `ab-harness.mjs` precondition (`hookExemptionConfirmed:true`) to
your eval runbook. Until then, the prompt-layer override in the recipes is sufficient
for the recipes to function; it is only the *measurement* that needs the source-level
fix to be uncontaminated.
