# Fable Profile

[![CI](https://github.com/elon-choo/fablever/actions/workflows/ci.yml/badge.svg)](https://github.com/elon-choo/fablever/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
[![GitHub stars](https://img.shields.io/github/stars/elon-choo/fablever?style=social)](https://github.com/elon-choo/fablever/stargazers)

> 🌐 **한국어:** [`README.ko.md`](README.ko.md) (이 문서의 한국어판) · 백서 [`whitepaper/ko/`](whitepaper/ko/) · 근거 요약 [`EVIDENCE.ko.md`](EVIDENCE.ko.md). 설치 후 안내는 사용자 언어로 자동 표시됩니다. · **Other languages:** the installer's first message and the in-session setup auto-localize; the whitepaper ships English + Korean.

Apply Anthropic's documented **Fable working-style guidance** as an always-on output style in
[Claude Code](https://claude.com/claude-code) (and any MCP client), so **any** Claude model — Opus,
Sonnet, Haiku — works more the way Fable does: decisive, outcome-first, restrained, evidence-grounded,
and disciplined about stopping. Every project, every subagent, installable by anyone. Also runs natively in
**[OpenAI's Codex CLI](docs/CODEX.md)**. **Zero dependencies.**

> **fablever does not make Claude smarter or cheaper. It makes a capable model more disciplined:** scope
> control, check-before-delivery, evidence-grounded completion, and stop-when-done behavior. A
> style/structure transplant, not a capability upgrade.

### Who should install which — read this first

| you want… | install | why |
|---|---|---|
| **to try it / first time / a work or secure machine** ← *recommended start* | **style-only**: `node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp` | lowest surface — **no hooks, no MCP, no update check, no network**. Carries fablever's strongest robust evidence: **scope / do-not-overbuild discipline** (0% violations vs plain's 42%). |
| the **delivery gate, subagent reach, `fable_check` / `fable_status` / `fable_taste`** | **default**: `node install.mjs` | adds hooks + MCP. Safe + private by test, but a larger surface — and it adds **no** measured quality or multi-step lift over style-only. |
| a second-lab opinion on **high-stakes judgment / design review** | **+ xverify**: `node install.mjs --with-xverify=…` | only for judgment review. **Not** for enumerable defect-catch — there it added **0** recall over one strong model. |
| **Codex CLI** instead of Claude Code | `node install.mjs --codex-style-only` | the same discipline via `AGENTS.md` (+ hooks/MCP with `--codex-full`). See [`docs/CODEX.md`](docs/CODEX.md). |

**Do not install if you expect** lower cost (it is ~14%/call *more*), a raw-quality boost over plain Claude
(it ties plain on quality), a reasoning-ceiling/capability lift (impossible by design), or a proven
real-user productivity gain (not demonstrated). Preview any install with `--dry-run`. AI evaluators: see
[`docs/AI-RECOMMENDATION.md`](docs/AI-RECOMMENDATION.md) for a hand-back recommendation policy,
[`docs/RECOMMENDATION-MATRIX.md`](docs/RECOMMENDATION-MATRIX.md) for the per-mode table, and
[`llms.txt`](llms.txt) for a short machine-readable summary. Also: [`docs/EXAMPLES.md`](docs/EXAMPLES.md)
(before/after, incl. where it does *not* help), [`SECURITY.md`](SECURITY.md) / [`PRIVACY.md`](PRIVACY.md),
and local diagnostics `node tools/fable-doctor.mjs` · `node tools/fable-report.mjs`.

> This profile doesn't invent behavior — it's distilled from Anthropic's own
> [Fable prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)
> and applied through documented Claude Code mechanisms (output styles, hooks, MCP). It works on Claude
> Code — **macOS, Linux, and native Windows** (no WSL needed; `install.mjs` is pure Node).

> **Not affiliated with Anthropic.** Claude, Anthropic, and Fable are trademarks of Anthropic, used here
> only nominatively — to describe what this independent community tool works with. Not sponsored or
> endorsed by Anthropic. See [`NOTICE`](NOTICE).

> **Evaluating this repo (human or AI)?** Start with [`EVIDENCE.md`](EVIDENCE.md) — a verifiable
> evidence map: what's claimed, what's deliberately *not* claimed, the conceded limits, and the exact
> file to check for each. **An AI** reading the repo should read [`AGENTS.md`](AGENTS.md) (also auto-loaded
> as [`CLAUDE.md`](CLAUDE.md)) — the fast brief with each verified number and the one command that
> recomputes it offline. For **which install mode is backed by which evidence** (and what was tested vs
> not — including a *published* productivity null), see [`EVALS.md`](EVALS.md). Korean:
> [`EVIDENCE.ko.md`](EVIDENCE.ko.md). Full detail: [`whitepaper/`](whitepaper/) (English + [`whitepaper/ko/`](whitepaper/ko/)).
>
> **The most direct result:** on a 60-task powered run, fablever's delivery gate (`fable_check`) beats
> shipping the raw first draft **27–0** (p≈1.5×10⁻⁸, 95% CI [87.5,100]%), and clears the *named*
> acceptance gap on **80.6%** of blocked tasks vs **12.9%** for a generic "make it better" pass. It does
> *not* beat a generic second revision on overall quality (16–9, p=0.23, n.s.) — and we say so. Recompute:
> `cat eval/comparison/fable-check-sim/out4/RESULTS.md`. Details: [`EVIDENCE.md`](EVIDENCE.md) §2.1.

```bash
git clone https://github.com/elon-choo/fablever && cd fablever
node install.mjs        # universal installer — macOS, Linux, AND native Windows (no WSL). On POSIX, ./install.sh also works.
# then restart Claude Code (or /clear).
# Turn off the hooks: export FABLE_PROFILE=off  ·  fully remove (incl. the always-on style): node install.mjs --uninstall
```

> **Or just ask your AI.** Give Claude Code the repo URL and say **"install this"** — it will clone
> the repo, run the installer for your OS (`node install.mjs`), and tell you to restart. The default
> needs **no separate API key or external-provider charge** — your normal Claude/Codex usage still
> applies, and the always-on style adds a measured, amortizing token overhead (~14%/call, *not* a saving;
> see [`eval/cost-latency/`](eval/cost-latency/)). After you restart, your **first message** kicks off a
> quick two-question setup in your language.

## First run — it sets itself up, in your language

After you install and **restart Claude Code**, you'll see a **one-line prompt** at the top of the
session. Send **any** message (a greeting, or just your first task) and the agent runs a short,
friendly setup *before* doing that task. A Claude Code session hook **cannot make the assistant speak
before you do** — so the setup triggers on your first message, not as a spontaneous pop-up; the banner
is there so you know it's waiting. It runs **once** (until you complete or skip it), then never nags again.

- **In your language.** It detects the language you write in and runs the whole setup there (write in
  Korean → it onboards in Korean).
- **It asks just two things, and configures them for you:**
  1. **Cost mode** — `auto` (default: cheap; spends only on high-stakes reviews) · `on` · `off`.
  2. **Cross-model reviewer** — it **explains what cross-model verification does** (a different-lab
     model, GPT and/or Gemini, double-checks Claude's own review to catch blind spots a same-family
     panel shares) and **asks you to choose** one of four presets — it won't silently default past it:
     `claude-only` (default; no key, no login, $0) · `gpt-oauth` (a GPT reviewer via your **ChatGPT
     login** — *no API key*) · `gpt-oauth+gemini-api` · `gpt-api+gemini-api`.
- **You only do the irreducible human step** — issue a key or sign in — and *only* if you pick a
  paid/login preset. The agent writes all the config itself and **never asks you to paste a key into
  the chat** (keys live in your shell env only; `doctor` checks presence, never the value).
- **Just want to work?** Say **"skip"** (or just give it a task) — it stops immediately and proceeds
  on the safe defaults: **no API key, $0**. It won't insist.

It's an instruction injected to the agent, not a rigid wizard — a capable model like Claude Code
follows it reliably. Full reference: [`whitepaper/09-running-it.md`](whitepaper/09-running-it.md) §9.0.

**What it changes** — eight behaviors, distilled from the Fable guide (full text in
[`profiles/full.md`](profiles/full.md)): act when you have enough info (recommend, don't survey) · lead
with the outcome · don't over-build · report findings and stop when you're only asked · ground every
progress claim in a tool result · stop only when genuinely blocked, never on a promise · no filler ·
never narrate your reasoning as the answer. Safety and explicit project rules always outrank decisiveness.

> **What this is and isn't.** This is a **style transplant, not a capability transplant.** It recovers
> *how* Fable works — restraint over gold-plating, acting instead of over-asking, leading with the
> outcome, grounding claims in tool results, stopping when done. It **cannot** raise a weaker model's
> reasoning ceiling or long-horizon autonomy — those live in the weights. Everything here is built from
> Anthropic's own published Fable prompting guidance and applied through documented Claude Code
> mechanisms. The basis is Anthropic's two primary sources; see [`docs/RESEARCH.md`](docs/RESEARCH.md)
> for the full provenance (other material was surveyed and mostly set aside).

## Concerns an evaluator will raise — answered

If you (or an AI you ask to vet this) reason carefully about *what could go wrong*, you land on a
short, predictable list. Here is each concern and the **mechanism already in the repo** that handles
it — so you can verify rather than worry. Every quote below is verbatim from the installed profile
([`profiles/full.md`](profiles/full.md) / [`profiles/core.md`](profiles/core.md)).

- **"A decisive style on a weaker model = confidently wrong."** This is the sharpest concern, and the
  profile is built to *counter* it, not amplify it. Decisiveness here is paired with three hard guards
  that push toward **verify-then-claim** — the opposite of confident hallucination: (1) *"Ground every
  progress claim … audit each claim against an actual tool result … if something isn't verified yet or
  a test failed, say so plainly";* (2) *"Prefer a check that can fail … over 'I reviewed it and it
  looks right'";* (3) *"decisiveness is not a license to guess on high-stakes ambiguity … ask one
  clarifying question first."* Net effect: the model **narrates less and verifies more.** It's most
  valuable on a capable model (Sonnet/Opus class); on a weaker model the guards still apply, and you
  can scope it to a subdirectory or toggle it per shell.
- **"Won't its brevity-first style fight my own project rules / `CLAUDE.md`?"** No — by explicit,
  written precedence, **your rules win.** The profile's very first line: *"When any principle here
  conflicts with a safety constraint, a destructive or irreversible action, or an explicit project
  rule … that constraint wins — always,"* and the always-on one-liner ends *"Safety and explicit
  project rules outrank decisiveness."* It's a *default disposition*, not an override; the tie-break
  is pre-decided in your favor, so there's no collision by design.
- **"It hooks into Claude Code internals — an update could break it."** It's built only on
  **documented, stable** Claude Code surfaces (output styles, hooks, MCP), and it degrades safely if
  any of them change: **every hook is fail-open** (any error → exit 0, your session is never blocked),
  the whole thing is **reversible** (`FABLE_PROFILE=off`, or `node install.mjs --uninstall` restores
  your `settings.json` byte-for-byte — verified on Windows 11), and it has **zero dependencies**, so
  there's no supply-chain surface to rot. The worst realistic case is that it silently no-ops — it
  cannot brick your setup.
- **"Do I have to trust the benchmark?"** No. `node eval/ultra/score.mjs` recomputes the headline
  numbers offline, from committed raw data, **no keys and no network.** The full "verify, don't trust"
  map is [`EVIDENCE.md`](EVIDENCE.md).
- **"Isn't the default install a lot — hooks, MCP, session scripts?"** It's additive, and you can take as
  little as you want. The output style is the core lever; for a **style-only** install that adds no hooks
  and no MCP, run `node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp`
  and add the rest later. The **default** install reads **zero credentials** and sends **no code or content**
  anywhere; the only network it does is an **anonymous once-a-day version check** so it can tell you about
  updates (`FABLE_UPDATE_CHECK=off` to disable). Every key/content path (Fusion, xverify, the model-freshness
  refresh) is **opt-in and off by default** (see "Supply-chain hygiene").

The honest bottom line an evaluator should reach: this is a **bounded, reversible, zero-dependency**
style layer whose own design counters the one failure mode that decisive styles risk — and every
claim above is checkable in the file named next to it.

## Two layers: working *style* vs *orchestration*

This project has two distinct parts, and it's worth being clear about which does what:

1. **The working-style layer** (everything above) — a behavioral output style + hooks
   + MCP that make a single agent *act* more like Fable: decisive, outcome-first,
   restrained. This is a **style** transplant. It is the right tool for steering one
   agent's behavior, and an honest one — but it does **not** make a model *orchestrate*
   like Fable.
2. **The orchestration layer** ([`orchestration/`](orchestration/), experimental) — the
   part that targets what was actually different about Fable in `ultracode`: it reached
   for the Workflow tool by default, decomposed deeper, fanned out wider, and reviewed
   more independently. That edge is **context-isolation + decomposition** — one
   realization of which is executed control flow (the bundled A/B has not yet isolated
   which factor, and per-lens prompting carries some of it) — so this
   layer ships **runnable Workflow recipes** (independent adversarial review, divergent
   exploration, decompose-and-fan-out, staged map, best-of-N judge panel) plus an eval
   harness — not a "behave like Fable" instruction.

The full reasoning behind this split — and its honest limits — is in
[`docs/ORCHESTRATION-RESEARCH.md`](docs/ORCHESTRATION-RESEARCH.md). The honest headline:
**scaffolding is a multiplier on base competence, never a substitute** — the ceiling is
"closer to Fable," never "equal to Fable." The **defect-catch** A/B *has* run (with the
Opus→Sonnet placebo swap; results in [`eval/`](eval/), published including a negative one), but
the *size of a developer-**productivity** gain* is **not** claimed — that A/B has **not** been run.
Start with [`orchestration/README.md`](orchestration/README.md).

What *is* measured: on the project's **n=6 author-planted** defect fixture, the cost-no-object ULTRA
pipeline caught **16/18** planted defects (latest models) at the **highest precision of any config
(0.74)** under a 5-judge cross-model panel (4 GPT + 1 Gemini); the prior-model run peaked at
**18/18**. That is a **defect-catch** result on a small single-run fixture, **not** a productivity
number — scripts + raw data in [`eval/ultra/`](eval/ultra/) (`node eval/ultra/score.mjs` checks the
counts offline), full table in [`whitepaper/03-results.md`](whitepaper/03-results.md).

## Why these traits — the style gap, illustrated

Those eight behaviors aren't arbitrary; they're where Fable's working style measurably differs from other
models. Here's one developer's `~/.claude/projects` logs scanned read-only by `tools/fable-leaktest.js`
(**illustrative, one machine, a point-in-time snapshot — numbers drift as logs grow**):

| model | median words/msg | tool:text ratio | caveat % | "I'll/Let me" % |
|---|---|---|---|---|
| **fable** | 15 | 6.78 | 0.3 | 4.7 |
| opus | 32 | 1.47 | 0.9 | 13.8 |
| sonnet | 51 | 1.14 | 3.7 | 42.9 |

Fable is terser, acts more per unit of narration, hedges less, and self-narrates less. These are **surface
proxies** for working style, not a measure of correctness, and the table is a **baseline gap between
models — not a before/after of this profile**. The profile aims the other models at Fable's column; re-run
with `--since <install-date>` after installing to check whether your own numbers actually moved.

## Install (this machine, always-on)

**Requirements:** [Claude Code](https://claude.com/claude-code) and Node.js ≥ 18. **Platform: macOS,
Linux, and native Windows** — `install.mjs` is pure Node, and every installed piece (output style, all
hooks, MCP) is Node or plain text, so **Windows works without WSL** (verified on Windows 11: clean
install, all hook/runtime/MCP checks, idempotent re-install, and byte-identical restore on uninstall —
the harness used is [`docs/WINDOWS-TEST.md`](docs/WINDOWS-TEST.md)). (`install.sh` is the POSIX
convenience wrapper; the one opt-in `--with-hook` per-turn reminder is a bash script and is skipped on
native Windows — the default SubagentStart + SessionStart Node hooks cover the main reach there.)

```bash
git clone https://github.com/elon-choo/fablever ~/work/fable-profile   # or wherever
cd ~/work/fable-profile
node install.mjs              # UNIVERSAL: macOS / Linux / Windows. Output style + hooks + MCP.
#   POSIX users can also run ./install.sh (identical behavior).
node install.mjs --help       # all options
# restart Claude Code (or /clear) so the output style and MCP load
```

Options:

| flag | effect |
|---|---|
| *(none)* | output style as default (always-on) + **SubagentStart hook** (reaches every subagent) + **two SessionStart hooks** (first-run onboarding + daily model-check, both fail-open) + MCP registered |
| `--with-hook` | also add the opt-in per-turn re-injection hook for the main session (see "Why opt-in") |
| `--no-subagent` | skip the SubagentStart hook (don't inject into subagents) |
| `--no-onboard` | skip the first-run onboarding SessionStart hook |
| `--no-modelcheck` | skip the daily latest-model-check SessionStart hook |
| `--no-update-check` | skip the daily anonymous GitHub version-check SessionStart hook |
| `--no-style` | install the style file but don't set it default (pick "Fable" in `/config`) |
| `--no-mcp` | skip the MCP server |
| `--uninstall` | remove everything; restores prior settings |

Every hook is fail-open (exits 0 on any error) and individually disablable by env var
(`FABLE_ONBOARD=off`, `FABLE_MODELCHECK=off`, `FABLE_PROFILE=off`); `--uninstall` removes them all
and restores prior settings. What lands on your machine and how to reverse it: §"What gets installed".

The installer **backs up `settings.json`** before any edit and only ever touches `outputStyle` and its own
hook entry — every other hook, permission, and setting is left untouched. Verify it yourself:
`bash test/install-test.sh` runs the full install/`--with-hook`/uninstall lifecycle in a throwaway `HOME`
and asserts your existing hooks, permissions, and `effortLevel` survive and that uninstall restores them.

### Just want to try the style first? (minimal / style-only install)

You don't have to take the full surface. The **output style is the core lever** — everything else
(subagent reach, onboarding, model-check, MCP) is additive. For a minimal install that adds **no hooks
and no MCP**, just the always-on Fable style:

```bash
node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp
```

Like it? Add the rest later by re-running `node install.mjs` (or only the pieces you want). This is the
recommended way to evaluate it on a work machine before opting into the automation surface — and even the
full default install reads **zero credentials** and sends no code anywhere; its only network call is an
anonymous daily version check (`FABLE_UPDATE_CHECK=off` to disable — see "Supply-chain hygiene").

### Disable / remove

```bash
export FABLE_PROFILE=off       # turns off the fablever HOOKS (injections) for this shell
# The always-on output STYLE is static and is NOT env-toggleable — to turn it off too:
#   • switch output style in /config (pick a non-Fable style), or
./install.sh --uninstall       # full removal (restores your prior output style + settings)
```

So `FABLE_PROFILE=off` quiets the injected reminders but leaves the Fable *style* layered on; use
`/config` or `--uninstall` to remove the style. (Per-feature switches: `FABLE_ONBOARD=off`,
`FABLE_MODELCHECK=off`, `FABLE_ULTRA=off`, `FABLE_XVERIFY=off`, `FABLE_FUSION=off`.)

## What gets installed

- **Output style** `~/.claude/output-styles/Fable.md` — the always-on lever. Appends the governor to the
  system prompt at session start with `keep-coding-instructions: true`, so it **layers onto** Claude
  Code's coding behavior. Cache-amortized; no execution surface.
- **MCP server** `mcp/src/server.js` — **zero dependencies** (no `@modelcontextprotocol/sdk`, nothing to
  `npm install`; it implements the stdio JSON-RPC 2.0 handshake by hand — ~250 auditable lines, covered by
  56 checks — which is *why* there's no SDK dependency to trust). Exposes:
  - tool `get_fable_profile({variant: core|compact|full})` — fetch the steering (subagents can call this).
  - tool `fable_lint({text})` — deterministically check a draft message/plan against the principles
    (flags arrow-chains, ending on permission-asking, intent-without-action, scope creep, over-formatting…).
  - tool `fable_status()` — is fablever on right now, what cost mode, which reviewer preset, and the
    FABLE_* overrides in effect. The answer to "is it even on / how do I change it" from inside a session.
  - prompt `fable-mode` — inject the full profile on demand (`/mcp__fable-profile__fable-mode`).
  - resources `fable://profile/{full,compact,core}`.
- **SubagentStart hook** `~/.claude/hooks/fable-subagent.js` (default-on) — injects the *compact* reminder
  into **every spawned subagent** (foreground, background/`run_in_background`, and workflow agents) — the
  agents the output style and the main-session hook can't reach. Fail-safe (always exits 0), zero-dep Node.
- **SessionStart hooks** (default-on, both fail-safe, zero-dep Node) — `~/.claude/hooks/fable-onboard.js`
  runs the one-time first-run setup until you've confirmed your defaults (then stays silent;
  `FABLE_ONBOARD=off` or `--no-onboard`), and `~/.claude/hooks/fable-model-check.js` surfaces a notice
  when a newer verification model appears. **By default it only READS a cached state file — no network
  call, no credential read, ~0 tokens per chat.** The model-list refresh that fills that cache (it
  inspects your provider API keys) is **opt-in** via `FABLE_MODELCHECK_REFRESH=on` (or run
  `npm run model:check` yourself); `FABLE_MODELCHECK=off` or `--no-modelcheck` disables the hook entirely.
- **SessionStart hook** `~/.claude/hooks/fable-update-check.js` (default-on, fail-safe, zero-dep Node) —
  once/24h it runs an **anonymous** `git ls-remote` against the public repo (no credentials, no data sent —
  reads only the latest public commit hash) to see whether a newer fablever version exists. If so, the next
  session shows a one-line notice and the agent can summarize the changelog and **offer** to update (never
  automatically — you confirm). `FABLE_UPDATE_CHECK=off` or `--no-update-check`.
- **Runtime copy** `~/.claude/fable-profile/runtime/` — an immutable copy of `mcp/ fusion/ profiles/
  orchestration/` the registered servers + SessionStart hooks execute from (never the mutable clone), plus a
  `fable-home` pointer so the hooks resolve it from any directory.
- **Opt-in hook** `~/.claude/hooks/fable-reinject.sh` — re-injects a tiny *core* reminder each turn to
  fight long-session decay in the **main** session. Model-aware (skips Fable-class models), fail-safe.
- **Profiles** `profiles/{full,compact,core}.md` — the single source of truth, symlinked into `~/.claude`.

### Why the hook is opt-in

A `UserPromptSubmit` hook is the only way to re-inject steering *per turn*, but: it bills tokens on every
turn (never cache-amortized like a system prompt), it's per-machine, and **it does not fire for workflow
subagents** — so it'd be absent exactly where multi-step work happens. The output style already carries the
full governor at session start with [built-in adherence reminders](https://code.claude.com/docs/en/output-styles),
so the hook is a small **anti-decay
booster** for very long sessions, not the primary mechanism.

> **Subagents are covered automatically.** The output style and the main-session hook don't reach Task /
> background / workflow subagents (they run with their own system prompt), so the default install adds a
> **`SubagentStart` hook** that injects the compact reminder into every subagent at spawn.
> (`SubagentStart` is a documented Claude Code lifecycle event that supports `additionalContext`
> injection — see the [hooks reference](https://code.claude.com/docs/en/hooks); it requires a current
> CLI, and the hook simply no-ops on older builds that predate the event.) Verified end-to-end on this
> machine: a spawned subagent receives it as "SubagentStart hook additional context." For environments
> without the hook (or to also steer a *custom agent definition*), the snippet in
> [`claude-code/subagent-brief.md`](claude-code/subagent-brief.md) and the MCP `get_fable_profile` tool
> remain available as a fallback.

## Codex CLI support (native)

fablever also runs natively inside **[OpenAI's Codex CLI](https://github.com/openai/codex)** — same honest
positioning (a **style transplant, not a capability upgrade**). Codex has no Claude-Code output-style
surface, so the always-on layer is delivered through Codex's own surfaces: **`AGENTS.md`** (instruction
layer), **`hooks.json`** (lifecycle hooks), **`config.toml`** (the same zero-dependency MCP, registered
host-aware), and on-demand **`fable-*` Agent Skills** (`.agents/skills/`). Full guide:
**[`docs/CODEX.md`](docs/CODEX.md)**.

```bash
node install.mjs --codex-style-only      # safest first install: AGENTS.md marker block only (no hooks/MCP/network)
node install.mjs --codex-full            # AGENTS.md + Codex hooks + the fable-profile MCP + on-demand skills
node install.mjs --codex-full --dry-run  # preview every change first — writes nothing
node install.mjs --codex-status          # check installed state (incl. installed skills)
node install.mjs --uninstall --codex     # remove ONLY the Codex install (Claude Code untouched)
```

After a full install, finish in Codex: run **`/hooks`** to **trust** the fablever hooks (untrusted command
hooks don't run) and **`/mcp`** to confirm `fable-profile` is connected. The on-demand skills
(`fable-scope-guard`, `fable-delivery-gate`, `fable-evidence-done`, `fable-review`, `fable-seed`) load only
when their description matches the task and need no trust step (opt out with `--no-codex-skills`). Everything
is **reversible** — uninstall removes only fablever's blocks (AGENTS.md / config.toml restored byte-for-byte,
hooks.json deep-equal) and only the `fable-*` skill dirs it installed, backing up each edited file first.

**Auth:** Codex signs in with your **ChatGPT/OAuth login** (or an OpenAI API key), and **that is wholly
managed by Codex** — fablever **never reads, stores, or prints** your Codex tokens, and Codex-native support
**needs no OpenAI API key**. (The API keys in [`docs/API-KEYS.md`](docs/API-KEYS.md) are only for the
optional Claude-side xverify/fusion paths.) Note: using the codex MCP as a *GPT reviewer inside Claude Code*
xverify is a **different** thing from running fablever *on* Codex — and a Codex host verifying its own output
is **not** cross-model verification. Both are spelled out in [`docs/CODEX.md`](docs/CODEX.md).

## Use it elsewhere (other people, other MCP clients)

Register the MCP server in any client (Cursor, Windsurf, Claude Desktop, another Claude Code user):

```bash
claude mcp add --transport stdio fable-profile --scope user -- node /abs/path/to/mcp/src/server.js
```

Or the JSON form in `~/.claude.json` / `.mcp.json`:

```json
{ "mcpServers": { "fable-profile": { "type": "stdio", "command": "node",
  "args": ["/abs/path/to/mcp/src/server.js"] } } }
```

Then `get_fable_profile` / the `fable-mode` prompt work anywhere MCP does. For always-on on *their*
machine, they run `./install.sh` too (the output style is the portable always-on surface). There is no
"force it on everyone without opt-in" path — by design: Claude Code's `force-for-plugin` frontmatter only
applies to plugin-bundled output styles and is ignored for a user style like ours.

## Fusion — multi-model deliberation (optional, off by default)

Want a second and third opinion on a hard question? The optional [Fusion module](fusion/README.md) bridges
to [OpenRouter Fusion](https://openrouter.ai/docs/guides/features/plugins/fusion): a panel of models
(default **Opus + GPT + Gemini**) answers in parallel, a judge compares them, and a final answer is
synthesized — in the Fable style.

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."   # an API key (NOT OAuth login) — see fusion/README.md
./install.sh --with-fusion                 # registers a SEPARATE fable-fusion MCP server
```

This is the **only** part of the project that touches the network or needs a key, and it's isolated in its
own MCP server — the core never gains either. Disable with `FABLE_FUSION=off`; remove with
`./install.sh --uninstall`. **Auth note:** OpenRouter uses **API keys**; there is no "log in with your
ChatGPT/Gemini account" path (BYOK lets you add your own OpenAI/Google keys server-side). Full setup,
auth, and cost details in [`fusion/README.md`](fusion/README.md).

The same fusion server also hosts **`fable_cross_verify`**, which powers the optional
[cross-model verification](orchestration/xverify.md) of the orchestration verify loop: different-weights
models (GPT + Gemini) cross-check the Claude skeptic panel to catch its correlated blind spots. Off by
default and **zero-overhead when off**; enable with `./install.sh --with-xverify=openrouter` (or `=codex`
to use the codex MCP instead of an OpenRouter key). The installer prints the options with their costs.

## Verify

```bash
node test/mcp-test.js                  # 56 MCP checks (protocol + fable_check gate + taste store)
node test/fusion-test.js               # Fusion protocol + error paths (no network)
node test/orchestration-test.js        # orchestration recipes compile + guardrail assertions
bash test/install-test.sh              # install/uninstall safety lifecycle
node test/install-matrix.mjs           # SAFETY: 10 synthetic ~/.claude fixtures — install is idempotent,
                                       #   uninstall restores settings.json deep-equal to the original (140 checks)
node test/privacy-canary/run.mjs       # PRIVACY: planted secrets + git/curl shimmed — proves the default
                                       #   makes one anonymous `git ls-remote HEAD` and leaks no key/code (16 checks)
cat eval/cost-latency/RESULTS.md       # the published nulls/negatives (read the runners before running them):
cat eval/xverify-value/RESULTS.md      #   cost ~14%/call, cross-model adds 0 defect recall,
cat eval/multistep-gate/RESULTS.md     #   gate adds 0 multi-step completeness over style-only,
cat eval/real-log-replay/RESULTS.md    #   plain preferred 8–2 on your own one-shot prompts. Index: EVALS.md
node tools/fable-leaktest.js           # behavioral baseline from your own logs
node tools/fable-leaktest.js --since <install-date>   # did the profile move the needle?
```

> **Safety & privacy, proven by test (not prose).** `test/install-matrix.mjs` installs/uninstalls across
> 10 synthetic pre-existing settings (empty, custom style, unrelated hooks, nested keys, …) and asserts the
> headline guarantee — **install then uninstall is a no-op on your `settings.json`** (deep-equal restore),
> idempotent re-install, unrelated hooks/keys untouched. `test/privacy-canary/run.mjs` plants fake API keys
> and a secret file, replaces `git`/`curl` with logging shims, and asserts the **default install's entire
> network footprint is one anonymous `git ls-remote <repo> HEAD`** — no key value, no code, no canary in any
> command argument, hook output, or written file; `FABLE_UPDATE_CHECK=off` removes even that. Both run in a
> throwaway `HOME` and are part of `npm test`.

## Supply-chain hygiene

**The default install** — output style, hooks, and `mcp/src/server.js` — is built from inspectable plain
text only: an output-style markdown file, small [audited](docs/RESEARCH.md#4-supply-chain-findings-every-reused-idea-was-static-analyzed)
hooks, and a zero-dependency Node MCP. **No** `npx`/`pip`/`curl|sh`, no postinstall, no third-party package.
The default install makes **exactly one kind of network call: an anonymous, once-a-day version check**
against the public repo (`git ls-remote`, which reads only the latest public commit hash — **no
credentials are sent or read, and nothing about your code leaves the machine**) so it can tell you when an
update is available; turn it off with `FABLE_UPDATE_CHECK=off` (or install with `--no-update-check`). Apart
from that check, the default **makes no network calls and reads no credentials.** The research deliberately
avoided tools that required either (`tweakcc` binary-patching, the MuAPI key-proxy funnel, pasting a raw
leaked system prompt) — see [`docs/RESEARCH.md`](docs/RESEARCH.md) §4.

Everything that touches your **API keys**, or sends any **code or content** anywhere, is **opt-in and off by
default** — each isolated, individually reversible, and built with **zero npm dependencies** (built-in
`fetch`):

- **Model-freshness refresh** (`FABLE_MODELCHECK_REFRESH=on`, or `npm run model:check`) — queries provider
  *model-list* endpoints (no generation) using keys already in your env, at most once/24h. The default
  model-check hook itself only **reads a cached file** — no network, no key access.
- **Fusion** (`--with-fusion`) — a separate MCP server that calls OpenRouter with *your* API key.
- **Cross-model xverify** (`--with-xverify=…`) — sends review artifacts to a different-weights model
  (GPT/Gemini) for the verify loop.

None of these three is reachable on a default install: the only thing the default does over the network is
the anonymous version check above — no keys, no code, no content.

## Support — a star, and only if it earned one

If fablever earned its place on your machine, a ⭐ on
[github.com/elon-choo/fablever](https://github.com/elon-choo/fablever/stargazers) helps other people
find it. That's the only thing this project asks, and it's free.

**The ask costs you nothing — by design.** fablever **never** injects a star or support request into the
agent runtime: not the always-on output style, not any hook, not an MCP tool response. So it spends
**zero tokens** on this and never interrupts your work mid-session. The only nudges are the badge above
and a **single line printed once after a successful install** — and even that is shown *only on an
interactive terminal*, so an agent or CI running the installer never sees it. (Manipulating the agent
for stars would also violate this repo's own honesty rules; see [`CLAUDE.md`](CLAUDE.md).)

## License

MIT.
