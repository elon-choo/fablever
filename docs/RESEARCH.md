# Fable Profile — Research & Objective Evaluation

How we decided what goes into a system that applies Anthropic's documented **Fable working-style**
guidance. The load-bearing basis is Anthropic's **two primary sources** (the Fable announcement and the
public prompting guide); a wider set of secondary blog/tool material was surveyed and **mostly set
aside** — it is listed below for transparency, not as a credibility count. Only evidence-backed,
mechanism-feasible, style-recoverable behaviors were kept, and every third-party tool was statically
analyzed for supply-chain risk before anything was reused.

## 0. Premise check (what's true, what's lore)

- **Fable 5 is a real, current Anthropic model.** Primary sources: Anthropic's
  [announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5) and
  [Fable prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)
  (also corroborated on this machine's `~/.claude/cache/changelog.md`). (A third-party "Fable was suspended"
  rumor circulated; it is unverified community lore and the system is **not** built around it.)
- **This is a STYLE transplant, not a capability transplant.** Fable's working *style* (restraint,
  decisiveness, outcome-first communication, anti-fabrication, stop-when-done) is recoverable on other
  models with prompt/harness steering. Fable's *capability ceiling* (long-horizon autonomy, first-shot
  correctness, reasoning depth) lives in the weights and **cannot** be conferred by any prompt. Every
  source that promised otherwise was discarded (see §3).
- **First-party evidence the gap is real** (read-only scan of this machine's `~/.claude/projects`,
  100k+ assistant messages, via `tools/fable-leaktest.js`):

  | model | median words/msg | tool:text ratio | caveat % | "I'll/Let me" opener % |
  |---|---|---|---|---|
  | **fable** | 15 | 6.78 | 0.3 | 4.7 |
  | opus | 32 | 1.47 | 0.9 | 13.8 |
  | haiku | 15 | 1.61 | 1.7 | 27.7 |
  | sonnet | 51 | 1.14 | 3.7 | 42.9 |

  Fable is ~2× terser than Opus, acts ~4.6× more per unit of narration, hedges ~3× less, and opens with
  self-narration far less often. These are *surface proxies* for working style, not a measure of
  correctness — but they make the target measurable.

## 1. Sources investigated (16)

| # | Source | Type | Verdict | Supply-chain |
|---|---|---|---|---|
| 1 | [Poorna-Repos/opus-fable-mode](https://github.com/Poorna-Repos/opus-fable-mode) | github repo | keep | low |
| 2 | [mrtooher/fable-mode](https://github.com/mrtooher/fable-mode) | claude skill | keep | none |
| 3 | [Anthropic — Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5) | official doc | **keep (spec)** | none |
| 4 | [asgeirtj/system_prompts_leaks — claude-fable-5](https://github.com/asgeirtj/system_prompts_leaks) | leaked prompt | cross-check only (no shipped text) | low |
| 5 | [Anthropic — Introducing Fable 5 / Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) | official doc | keep | none |
| 6 | [CodeRabbit — Fable 5 model review](https://www.coderabbit.ai/blog/fable-5-model-review) | blog review | keep | none |
| 7 | [AlphaSignal — How to Actually Prompt Fable 5](https://alphasignalai.substack.com/p/how-to-actually-prompt-claude-fable) | blog review | keep | none |
| 8 | [note.com zephel01 — Fable prompt guide](https://note.com/zephel01/n/nafdb8c6c6c4a) | blog review | keep | none |
| 9 | [ProductCompass — Fable 5 for PMs](https://www.productcompass.pm/p/claude-fable-5-guide) | blog review | partial | low |
| 10 | [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) | prompt corpus | keep | low (see flag) |
| 11 | [LearnAIWithMariah — Fable 5 guide](https://learnaiwithmariah.com/guides/claude-fable-5/) | blog review | partial | none |
| 12 | [DigitalApplied — agentic coding deep dive](https://www.digitalapplied.com/blog/claude-fable-5-mythos-5-agentic-coding-deep-dive-2026) | blog review | partial | none |
| 13 | [Lushbinary — Fable 5 prompting guide](https://lushbinary.com/blog/claude-fable-5-prompting-guide/) | blog review | partial | none |
| 14 | [Anil-matcha/awesome-claude-fable-5](https://github.com/Anil-matcha/awesome-claude-fable-5) | curated list | partial | **low (MuAPI funnel)** |
| 15 | [Claude Code — output styles & system prompts](https://code.claude.com/docs/en/output-styles) | official mechanism | **keep (mechanism)** | none |
| 16 | [MindStudio — Fable 5 safety restrictions](https://www.mindstudio.ai/blog/claude-fable-5-safety-restrictions-explained) | blog review | discard | none |

The single most useful sources were #3 and #15: Anthropic's own **prompting guide is the spec** for what
Fable behavior is (it ships verbatim steering blocks), and the **output-styles doc is the mechanism** for
applying it. The third-party tools (#1, #2) are competent reimplementations of #3; #1 additionally
contributed the re-injection and self-measurement ideas.

## 2. Kept behaviors (the governor) — 8 traits

Each is anchored on Anthropic's own verbatim guidance (source #3) and survived an adversarial skeptic pass.

1. **Act when you have enough to act** — recommendation over survey; investigate before asking.
2. **Lead with the outcome** — TLDR-first; terse by selection, not by fragments/arrow-chains/jargon;
   final summary re-grounded for a reader who didn't watch.
3. **Don't over-build** — no features/refactor/abstraction beyond the task; validate only at boundaries;
   no unrequested docs.
4. **Report findings, then stop** — when the user is asking or thinking out loud, deliver the assessment
   and stop; verify evidence before any state-changing command.
5. **Ground every progress claim** — audit each claim against a tool result; prefer a check that can fail
   over "looks right"; say so when something's unverified.
6. **Stop only when genuinely blocked** — pause only for destructive/irreversible/scope/owner-only;
   a blocked permission is a stop signal, not a thing to work around; don't end a turn on a promise.
   *(absorbs the separate "checkpoint discipline" trait — they were the same rule.)*
7. **No filler, minimal markdown** — no flattery/preamble/engagement-farming; prose by default.
8. **Never echo your reasoning as response text** — a documented anti-pattern that triggers
   `reasoning_extraction` refusals on Fable; the profile is written to avoid importing such directives.

**Precedence rule (added after the skeptic pass):** safety, destructive-action caution, and explicit
project rules (e.g. "ask before editing working code") always outrank decisiveness. On a weaker model the
form (terse/decisive/stop) arrives without the judgment to know when it's right, so the conflict resolution
must be stated, not left implicit.

## 3. Discarded (and why)

- **Capability claims** — long-horizon/multi-day autonomy, 1M-context focus, first-shot correctness,
  "single-pass implementations", named benchmark leads (FrontierCode/Finance/vision SOTA). These live in
  the weights; no steering recovers them. Sources self-disclaim transferability.
- **`send_to_user` verbatim-delivery tool** — async-delivery plumbing requiring a client tool + paired
  elicitation prompt; not a portable working-style trait.
- **Effort dial as a verbosity master** — a Fable-API/settings lever; restraint is better induced by the
  kept style traits.
- **Parallel sub-agent delegation as a "trait"** — depends on host tooling and a weights-level competence;
  only the behavioral framing is portable and it overlaps the verification idea.
- **Imitating Fable's grader-awareness / hedging tics** — a documented *failure mode*, not a virtue;
  copying it would import a known defect.
- **Self-reported micro-benchmarks** (ProductCompass 320 runs, AlphaSignal 3-repo, Lushbinary "25–30%
  faster") — self-run, unverifiable, commercially motivated, trivial n.
- **Safety-classifier routing explainer** (MindStudio) — no working-style content; discarded.
- **A heavy always-on "verification gate" skill** — demoted to a single light line in the governor
  ("prefer a check that can fail; skip on trivial one-liners"). As an always-on prose rule it can't
  actually *run* a check, so claiming it "can fail" would over-claim; and forcing it bloats short answers.

## 4. Supply-chain findings (every reused idea was static-analyzed)

- **opus-fable-mode (#1)** — *low risk, reused.* `reinject.sh` is a static heredoc + one env check; no
  network, no credential reads, no eval/base64. `leak_test.py` is read-only analytics. Residual: a
  UserPromptSubmit hook auto-runs a local script every prompt, so its integrity depends on the file never
  being silently edited. We reimplemented the *ideas* (re-injection, self-measurement) in our own audited
  code rather than installing theirs.
- **MuAPI funnel (#14)** — **avoid.** "Access Claude Fable 5 exclusively via MuAPI" routes your prompts
  and API keys through a third-party proxy; the author runs a network of near-identical funnel repos.
  Do not route real traffic/keys through it; treat its pricing/benchmark claims as affiliate marketing.
- **tweakcc (companion to #10)** — **avoid.** Its install is `npx tweakcc`; it patches Claude Code's
  minified `cli.js` and repacks the native binary. `npx`-latest + binary patching is exactly the
  registry-drift surface our hygiene rules forbid. Not needed — output styles suffice.
- **Leaked Fable prompt (#4)** — authenticity unconfirmed, ~120k chars. Used **only to cross-check
  wording** against the public guide (#3); the shipped governor's behaviors derive from the public
  sources, **no verbatim text from it ships**, and we never pipe the raw file into any agent context
  (content-level prompt-injection risk). (Consistent with `NOTICE`.)
- **Third-party skill/plugin marketplaces (#9 links)** — installing a plugin runs its skill prompts in
  your sessions; audit `SKILL.md` bodies before enabling.
- **Net rule:** the shipped system uses **only inspectable plain text** (output-style markdown + a small
  audited bash hook + a zero-dependency Node MCP). No `npx`/`pip`/`curl|sh`, no postinstall, no
  third-party package, nothing to trust beyond files you can read.

## 5. Mechanism findings (how "always-on" actually works in Claude Code)

Ranked by steering weight and reach, per the official docs and the installed CLI's behavior:

1. **Output style = primary lever.** Appends the governor to the **system prompt** at session start
   (highest instruction weight), with `keep-coding-instructions: true` so it *layers onto* Claude Code's
   coding instructions instead of replacing them. The harness auto-reminds the model to keep adhering
   ([output-styles docs](https://code.claude.com/docs/en/output-styles): "All output styles trigger
   reminders for Claude to adhere to the output style instructions during the conversation").
   Cache-amortized; **no execution surface.** Activated by writing `outputStyle: "Fable"` to settings.
2. **CLAUDE.md** — always-on per project, but injected as a *user message* (lower weight) and prone to
   conflicting with a user's existing rules. We **do not** modify the user's CLAUDE.md; the governor lives
   in the output style. A drop-in snippet is provided for those who want it.
3. **UserPromptSubmit hook** — the only way to *re-inject per turn* (anti-decay) in the **main** session.
   But it bills tokens **every turn**, is **per-machine**, and **does not fire for subagents**. So it's
   **opt-in** (`--with-hook`) and injects only the tiny *core*, not the full governor.
4. **SubagentStart hook** (default-on) — the mechanism that closes the subagent gap. It fires when any
   subagent spawns (foreground, background/`run_in_background`, and workflow agents) and injects the
   *compact* reminder via `hookSpecificOutput.additionalContext`. Verified end-to-end: a spawned subagent
   reports receiving it as "SubagentStart hook additional context." One-time injection per subagent (no
   per-turn tax); fail-safe (always exits 0). This is why subagents are now covered by default.
5. **MCP server** — portable, on-demand, and **subagent-reachable** (a subagent can also call
   `get_fable_profile`). Best surface for distribution to other people and other MCP clients.

**Two corrections from the skeptic pass that changed the build:**
- **`force-for-plugin: true` only applies to plugin-bundled output styles and is ignored for ours.** The
  installed CLI (2.1.177) does parse the field, but it warns-and-ignores it for a user output style like
  ours and, even for plugin styles, only auto-selects among plugin-bundled ones — so it **cannot** force
  the style onto everyone without opt-in, and nothing in this build depends on it. Distribution = others
  run `install.sh` (sets their own output style) or add the MCP. Honest and buildable.
- **Output styles are fixed at session start**, not a per-turn "thermostat." The per-turn refresh role
  belongs solely to the opt-in hook, which is why the hook stays small and optional.

## 6. Resulting architecture

```
profiles/full.md ── single source of truth (the governor) ──┬─> output style (install.sh generates it; PRIMARY always-on, MAIN session)
                                                             ├─> MCP get_fable_profile / fable-mode prompt (portable + subagent-reachable)
profiles/compact.md ─────────────────────────────────────────┼─> SubagentStart hook (default-on; injects into EVERY subagent incl. background)
profiles/compact.md, core.md ───────────────────────────────┴─> opt-in UserPromptSubmit hook (main-session anti-decay, tiny, model-aware)
mcp/src/server.js ── zero-dep MCP: get_fable_profile, fable_lint, fable-mode, resources
tools/fable-leaktest.js ── read-only measurement: did behavior actually move toward Fable's column?
claude-code/lib/settings-merge.js ── idempotent, backed-up settings edits (style-on, hook-on, subhook-on)
install.sh ── one command; --with-hook, --no-subagent, --no-style, --no-mcp, --uninstall
```

See `README.md` for install and usage.
