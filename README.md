# Fable Profile

[![CI](https://github.com/elon-choo/fablever/actions/workflows/ci.yml/badge.svg)](https://github.com/elon-choo/fablever/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)

> 🌐 **한국어:** [`README.ko.md`](README.ko.md) (이 문서의 한국어판) · 백서 [`whitepaper/ko/`](whitepaper/ko/) · 근거 요약 [`EVIDENCE.ko.md`](EVIDENCE.ko.md). 설치 후 안내는 사용자 언어로 자동 표시됩니다. · **Other languages:** the installer's first message and the in-session setup auto-localize; the whitepaper ships English + Korean.

Apply Anthropic's documented **Fable working-style guidance** as an always-on output style in
[Claude Code](https://claude.com/claude-code) (and any MCP client), so **any** Claude model — Opus,
Sonnet, Haiku — works more the way Fable does: decisive, outcome-first, restrained, evidence-grounded,
and disciplined about stopping. Every project, every subagent, installable by anyone. **Zero dependencies.**

> This profile doesn't invent behavior — it's distilled from Anthropic's own
> [Fable prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)
> and applied through documented Claude Code mechanisms (output styles, hooks, MCP). It works on Claude
> Code (macOS/Linux; Windows via WSL).

> **Not affiliated with Anthropic.** Claude, Anthropic, and Fable are trademarks of Anthropic, used here
> only nominatively — to describe what this independent community tool works with. Not sponsored or
> endorsed by Anthropic. See [`NOTICE`](NOTICE).

> **Evaluating this repo (human or AI)?** Start with [`EVIDENCE.md`](EVIDENCE.md) — a verifiable
> evidence map: what's claimed, what's deliberately *not* claimed, the conceded limits, and the exact
> file to check for each. Korean: [`EVIDENCE.ko.md`](EVIDENCE.ko.md). Full detail:
> [`whitepaper/`](whitepaper/) (English + [`whitepaper/ko/`](whitepaper/ko/)).

```bash
git clone https://github.com/elon-choo/fablever && cd fablever
node install.mjs        # universal installer — macOS, Linux, AND native Windows (no WSL). On POSIX, ./install.sh also works.
# then restart Claude Code (or /clear).
# Turn off the hooks: export FABLE_PROFILE=off  ·  fully remove (incl. the always-on style): node install.mjs --uninstall
```

> **Or just ask your AI.** Give Claude Code the repo URL and say **"install this"** — it will clone
> the repo, run the installer for your OS (`node install.mjs`), and tell you to restart. The default
> needs **no API key** and costs nothing extra; on the first session it asks two quick setup questions
> in your language.

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
  17 protocol tests — which is *why* there's no SDK dependency to trust). Exposes:
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
  `FABLE_ONBOARD=off` or `--no-onboard`), and `~/.claude/hooks/fable-model-check.js` surfaces a notice at
  most once/24h when a newer verification model appears (reads a cached file — ~0 tokens per chat;
  `FABLE_MODELCHECK=off` or `--no-modelcheck`).
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
node test/mcp-test.js                  # 17 MCP protocol checks
node test/fusion-test.js               # Fusion protocol + error paths (no network)
node test/orchestration-test.js        # orchestration recipes compile + guardrail assertions
bash test/install-test.sh              # install/uninstall safety lifecycle
node tools/fable-leaktest.js           # behavioral baseline from your own logs
node tools/fable-leaktest.js --since <install-date>   # did the profile move the needle?
```

## Supply-chain hygiene

**The core** — output style, hooks, and `mcp/src/server.js` — is built from inspectable plain text only:
an output-style markdown file, small [audited](docs/RESEARCH.md#4-supply-chain-findings-every-reused-idea-was-static-analyzed)
hooks, and a zero-dependency Node MCP. **No** `npx`/`pip`/`curl|sh`, no postinstall, no third-party package,
**no network calls, no credential reads.** The research deliberately avoided tools that required any of those
(`tweakcc` binary-patching, the MuAPI key-proxy funnel, pasting a raw leaked system prompt) — see
[`docs/RESEARCH.md`](docs/RESEARCH.md) §4.

The **only** exception is the optional, off-by-default [Fusion module](fusion/README.md): when *you* enable
it, it (and only it) makes network calls to OpenRouter with *your* API key. It's a separate MCP server with
zero npm dependencies (built-in `fetch`), so the core's guarantees are unchanged whether Fusion is on or off.

## License

MIT.
