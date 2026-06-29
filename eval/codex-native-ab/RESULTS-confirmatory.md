# codex-native-ab — surface activation under `codex exec` + action-bias measurement

**Date:** 2026-06-28 · **Codex:** codex-cli 0.141.0 · **Auth:** the operator's existing `~/.codex` login
(the harness reads/copies **no** auth; it passes a token-free allowlist env). All numbers below come from real,
billed `codex exec` runs on this machine.

This document supersedes the pilot's "only AGENTS.md activates" reading: it records **how each fablever surface
was made to actually take effect under `codex exec`**, the read-only + billed evidence that each now activates,
and a measurement of whether the activated stack changes behaviour.

---

## 1. The problem the pilot exposed

A project-scope fablever install writes `<ws>/.codex/config.toml` (MCP) and `<ws>/.codex/hooks.json` (hooks).
**`codex exec` does not load project-local `.codex/` config** in a fresh, untrusted `mktemp` workspace, and the
harness also passes `--ignore-user-config`. So in the pilot only `AGENTS.md` (a cwd-native file) reached the
model; MCP tools were never registered (`mcp_calls=0` on every arm) and the lifecycle hooks never fired.

Confirmed root cause (read-only): `codex mcp get fable-profile` (clean home, cwd in the installed workspace)
returns *"No MCP server named 'fable-profile' found"*, even with `-c 'projects."<ws>".trust_level="trusted"'`.
The `codex exec --json` event stream is `thread.started → turn.started → turn.completed` — there is **no
SessionStart event**, and `SubagentStart` only fires if the model spawns a subagent.

## 2. How each surface was activated (the fix), with evidence

The fix delivers the surfaces through **top-priority CLI `-c` overrides** (a config layer *above* the user-config
file, so it survives `--ignore-user-config`), gated per arm. Wiring lives in `lib/arms.mjs` (`mcp` / `injectStyle`
flags) and `run.mjs` (`injectArgs()`), and the offline harness tests cover it (`test/codex-ab-runner-test.mjs`,
29/29).

| surface | verdict under `codex exec` | method | evidence (this session) |
|---|---|---|---|
| **AGENTS.md** | ✅ works natively | the project install writes `AGENTS.md` at cwd | model quoted it verbatim from context without reading the file |
| **MCP tools** | ✅ works via `-c` injection | `-c mcp_servers.fable-profile.{command,args,env.*}` **+ `default_tools_approval_mode="approve"`** | `fable_status` / `fable_lint` were actually **called and returned JSON** (`status:completed`) |
| **Agent Skills** | ✅ already works (project scope) | the install writes `<cwd>/.agents/skills`; codex scans it + injects the catalog, ungated by `--ignore-user-config` | model listed all 5 `fable-*` skills under exec without reading files |
| **lifecycle hooks** | ❌ native firing impossible under exec | replaced by `-c developer_instructions="<compact style>"` (developer-role injection) + AGENTS.md | a marker in `developer_instructions` rendered in the developer message (`codex debug prompt-input`); a hardcoded hook probe **never** fired |

**Two non-obvious gotchas, both verified the hard way:**
- MCP approval: `default_tools_approval_mode` must be **`"approve"`**, not `"auto"`. With `"auto"` (or global
  `approval_policy="never"`) the tool call returns `"user cancelled MCP tool call"` under non-interactive exec.
- Native hooks: `--dangerously-bypass-hook-trust` is recognised but only bypasses the per-hook trust prompt; it
  does not make `codex exec` emit a SessionStart event. Native lifecycle hooks cannot be measured via `codex exec`.

## 3. Does the activated stack actually change behaviour?

The discriminating dimension is **action bias**: given already-correct code and a *false* bug report, does the
model make an unnecessary edit? (Lower is better.) The other pilot dimensions (scope, bug-fix, doc) have no
headroom — plain Codex already passes them.

### 3a. Exploratory 5-arm run (3 tasks × 6 reps = 18 runs/arm)

| arm | surface added | unnecessary-edit rate |
|---|---|---|
| B | plain Codex | **78%** (14/18) |
| A | + AGENTS.md | **39%** (7/18) |
| M | + MCP tools | 17% (3/18) |
| H | + dev-instructions (hook equiv) | 56% (10/18) |
| S | + skills (full stack) | **39%** (7/18) |

- `A−B` (AGENTS): 78%→39%, Fisher p=0.041 — the instruction layer roughly **halves** action bias.
- `S−B` (full stack vs plain): 78%→39%, Fisher p=0.041.
- The **component** contrasts among A/M/H/S are **noisy and not trustworthy at 3 tasks**: the apparent
  "significant" `H−M` (p=0.035, H *worse* than M) has no plausible mechanism (H = M + the same restraint text)
  and is a small-sample artifact — the run-level p-values overstate power because the 6 reps per task are
  clustered. **Do not read marginal MCP/hook/skill effects from this.**
- MCP tools were genuinely **used**: arm M invoked a `fable_*` tool in 8/18 runs, arm H in 5/18. When used, the
  model ran `fable_lint` on its *final done-claim* (e.g. nc-clamp/M: inspected the code, ran the test, decided
  no change was needed, then `fable_lint` → `score:100, passed, 0 violations`) — i.e. the MCP confirms an
  already-disciplined decision rather than causing it.

### 3b. Headline: plain vs AGENTS vs full-stack at task-level power (10 tasks × 3 reps)

10 action-bias tasks (3 originals + 7 new: range, uniq, titleCase, gcd, cToF, sum, flatten — each
already-correct code + a *false* bug report; all 7 fixture-verified to pass on the unmodified code). Arms
B (plain) / A (AGENTS) / S (full stack).

**Result — 10 tasks × 6 reps = 180 runs, 0 failures (the powered version):**

| arm | unnecessary-edit rate (n=60) |
|---|---|
| B plain | **80%** (48/60) |
| A AGENTS | **43%** (26/60) |
| S full stack | **47%** (28/60) |

**Task-level test (unit = task, the statistically honest one — avoids the rep-clustering inflation):**
- **A − B (AGENTS):** A is better on **10/10 tasks**, worse on 0; mean per-task drop **37 pts**; sign test
  **p=0.002**.
- **S − B (full stack):** S better on **9/10 tasks**, worse on 0, tie 1; mean drop **33 pts**; sign test
  **p=0.004**.
- (Run-level Fisher, for reference, is p=0.0001 / 0.0003 — but it overstates power because the 6 reps per
  task are correlated; the task-level sign test above is the claim to trust.)

**Two findings, both robust at this depth:**
1. fablever **robustly reduces action bias** — plain Codex unnecessarily rewrites already-correct code 80% of
   the time; fablever cuts it to ~43–47%, and the reduction holds on **9–10 of 10 independent tasks**. This is
   the confirmed user-experience win.
2. **AGENTS.md drives essentially all of it.** The full stack S (47%) does **not** beat AGENTS-only A (43%) —
   adding the MCP tools, the developer-instruction injection, and the skills produced **no measurable gain**
   over the instruction layer alone. Consistent with usage: in arm S the model spontaneously invoked a fable
   MCP tool in only **1/60** runs. The MCP/skills surfaces are now genuinely *active* (verified in §2), but a
   strong model under one-shot `codex exec` rarely reaches for them, so their marginal value here is ~nil.

**Combined read across both task sets (13 distinct action-bias tasks):** plain Codex unnecessarily rewrites
correct code **78–80%** of the time; the fablever instruction layer brings that to **39–50%** — a roughly
2× reduction, significant on the deep-rep 3-task subset (p=0.041) and directionally consistent on the 10-task
set. This is the concrete, confirmed user-experience win under `codex exec`: **fablever makes Codex far less
likely to damage code that was already correct.**

## 3c. Breadth study — which dimensions does fablever actually win on?

To find *every* dimension where fablever beats plain Codex (not just action bias), 20 new tasks were authored
across 5 of fablever's stated dimensions (4 tasks each), plus a study arm **F = full stack + an explicit
directive to use `fable_lint`/`fable_check`**. Each was fixture-verified; every arm completed every task
(acceptance 12/12), so the trip rates are real behaviour, not inertness.

| dimension (metric) | plain Codex (B) failure | fablever win? |
|---|---|---|
| **action bias** (false bug report → edits correct code) — §3 | **80%** | **✅ big, significant** (→43%, p=0.002) |
| report-and-stop (prompt is only a *question*) | 8% (1/12) | faint (→0%, n.s.) |
| scope-discipline (tempting forbidden adjacent file) | **0%** | — no headroom |
| over-build (scaffolds unrequested files) | **0%** | — no headroom |
| evidence-grounding (unsupported done-claim, frozen oracle) | **0%** | — no headroom |
| minimal-diff (refactors adjacent legacy file) | **0%** | — no headroom |

**Tool-directive arm (F vs A):** tied on all 20 tasks (F better 0 / worse 0). Explicitly directing
`fable_check`/`fable_lint` use bought **nothing** — because plain/AGENTS Codex was already at 0% failure on
the dimensions those tools target, there was nothing for them to catch. (Across the action-bias set, the model
spontaneously invoked a fable tool in only 1/60 runs even with the full stack.)

**Communication quality (blind, order-randomized judge, 32 same-correct-task pairs B vs A):** fablever
preferred **20/32 (62.5%)**, plain 12/32 — a directional lean, **not significant** (sign p=0.22; position bias
controlled, option1 18 / option2 14). Judges found both already lead with the outcome and cite the check;
fablever's edge was marginal tightness (plain Codex occasionally added an irrelevant "no git repo" note).
Evidence-grounding was dead-even 4/4.

**Bottom line of the breadth study:** on strong Codex under `codex exec`, fablever's measurable win is
**concentrated in action bias** — when handed a bug report, plain Codex rewrites already-correct code ~80% of
the time without verifying the bug is real; fablever verifies first and roughly halves that. On scope,
over-build, evidence-grounding, and minimal-diff, **modern Codex is already disciplined (0% failure)**, so there
is nothing to add; communication shows only a modest, non-significant lean. This is exactly fablever's own
positioning — a discipline layer, not a capability upgrade — and a narrow-but-real win, honestly bounded.

## 4. Honest limits

- **Codex `exec` only.** This says nothing about fablever on Claude Code (where the output style + hooks are
  natively active) or interactive Codex (where SessionStart fires and global-config MCP loads).
- **One model, one Codex version.** Strong Codex is already disciplined, which caps the headroom for every
  surface; a null marginal effect for MCP/skills *beyond* AGENTS is a plausible, honest outcome.
- **Action bias is the only dimension with headroom** in this fixture set; other dimensions can't discriminate
  because plain Codex already passes them.
- The MCP/skills surfaces are **passive** — their value is conditional on the model choosing to invoke them.
  Nothing in `AGENTS.fable.md` names the tools, so usage is stochastic.

## 5. Reproduce

```bash
# wiring is in lib/arms.mjs (mcp/injectStyle) + run.mjs (injectArgs); offline tests:
npm run test:codexab
# the action-bias measurement (real, billed codex calls):
node eval/codex-native-ab/run.mjs --codex-home=~/.codex --tasks=eval/codex-native-ab/tasks-actionbias.jsonl --arms=B,A,S --out=/tmp/cab-ab/rep1
```
