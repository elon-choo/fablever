# Cross-model verification (optional, off by default)

The orchestration verify loop (`adversarial-verify`) spawns independent **Claude** skeptics.
That defeats the completion attractor (a fresh context can't rubber-stamp), but it has one
honest limit the research flagged:

> A same-family panel shares **correlated blind spots** — a class of defect that only a
> genuinely *different-weights* model would catch. (See `docs/ORCHESTRATION-RESEARCH.md` §3.)

Cross-model verification closes that gap: when enabled, a **different-weights model** (GPT,
Gemini, …) reviews the artifact *alongside* the Claude panel. It is **off by default**, and
when off it adds **zero** agents, network calls, or overhead — the base verify loop is
untouched.

## The three options (presented at install time, with cost)

| option | how | cost |
|---|---|---|
| **[A] Claude-only** *(default)* | nothing to configure | $0 extra, no network. Same family → shared blind spots. |
| **[B] OpenRouter** | `./install.sh --with-xverify=openrouter` | ~1 OpenRouter call per extra model per verify (GPT + Gemini by default). Needs `OPENROUTER_API_KEY`. |
| **[C] Codex MCP** | `./install.sh --with-xverify=codex` | uses your ChatGPT/Codex subscription quota (no OpenRouter key). Needs the codex MCP connected — one-time setup (3 commands) in [`../docs/API-KEYS.md`](../docs/API-KEYS.md) § Set up the codex MCP. |

The installer prints this menu every run and writes your choice to
`~/.claude/fable-profile/xverify.json`.

## How it plugs in (and why "off" is truly free)

1. `install.sh --with-xverify=<mode>` writes `~/.claude/fable-profile/xverify.json`:
   ```json
   { "mode": "openrouter", "models": ["openai/gpt-4o", "google/gemini-2.5-pro"], "n": 1 }
   ```
2. The **`orchestrate` skill** reads that file before launching `adversarial-verify`. If
   `mode` is `openrouter`/`codex`, it passes `args.crossModel = { provider, models }`. If
   `mode` is `off` (or the file is absent), it passes nothing.
3. The recipe only builds a cross-model agent **when `args.crossModel` is present**. With it
   absent, that code path never executes — no extra `agent()`, no MCP call, no key needed.

So "off" is not a flag the recipe checks at runtime and skips; it's the **absence of an
argument**, which means the cross-model branch is never even constructed.

- **OpenRouter path:** the cross-model agent calls the `fable_cross_verify` tool on the
  `fable-fusion` MCP server, which sends the artifact to each configured model and returns
  each one's structured refute-verdict. The Claude agent relays those findings faithfully.
- **Codex path:** the cross-model agent uses the `mcp__codex__codex` tool to get GPT/Codex's
  refutation, then relays it.

## Toggling

```bash
export FABLE_XVERIFY=off          # disables the OpenRouter path (checked in the fusion server)
./install.sh --with-xverify=off   # persist "off" (sets xverify.json mode=off)
./install.sh --with-xverify=openrouter   # re-enable
```

**Scope of the switches (important — they are not symmetric):**
- `FABLE_XVERIFY=off` / `FABLE_FUSION=off` are checked **only in the fusion server**, so they
  disable the **OpenRouter** path. They do **NOT** stop the **codex-MCP** path: when
  `xverify.json` mode is `codex`, the cross-model agent calls `mcp__codex__codex` directly and
  never touches the fusion server, so those env vars do not gate it.
- The **single switch that disables both paths** is `xverify.json` mode (set `off` via
  `./install.sh --with-xverify=off`), because the `orchestrate` skill reads that file and only
  passes `crossModel` when it is enabled. To kill the **codex** egress specifically, set mode `off`
  (or disconnect the codex MCP). Do not rely on `FABLE_XVERIFY=off` for the codex channel.

## Honest scope

- Cross-model verdicts are **bonus coverage**: they are added to the findings and the
  synthesis, but they do **not** change the RED gate (which still requires the full Claude
  panel to return). A cross-model reviewer being unavailable never blocks delivery.
- This is a **runtime verification** aid, not the eval judge. The A/B harness
  (`eval/ab-harness.mjs`) must keep an *independent, condition-blind* judge that is **not**
  one of the cross-verify models — using a sibling/cross panel as the judge leaks the
  treatment (see `eval/README.md`).
- It improves *recall of correlated-blind-spot defects*. It does **not** raise the per-model
  reasoning ceiling. Honest as ever: a lever, not a substitute.
- **A cross-model "all clear" is NOT authoritative.** The artifact under review is, by design,
  arbitrary attacker-influenceable text, and it is embedded in the reviewer model's prompt. A
  hostile artifact can prompt-inject the cross-model reviewer into returning `refuted:false`.
  Because cross-model verdicts are folded into the findings a human reads, treat a cross-model
  pass as a weak signal, never a guarantee — its only hard guarantee is that it never changes
  the RED gate.
- **`fable_cross_verify` applies no Fable-style steering.** Unlike `fable_fusion` (which has a
  `fable_style` parameter), the cross-verify tool exposes no such parameter and never injects the
  Fable system prompt, so the independence it sells is not contaminated by re-steering the
  "independent" reviewer with our own style.

## Supply-chain & data-governance note

The cross-verify tool reuses the existing zero-dependency `fusion-server.js` (built-in
`fetch`, no npm packages, no postinstall). It is the **only** network/key surface, isolated in
the optional fusion MCP — the core orchestration recipes stay zero-network when cross-verify is
off.

**What leaves your machine, and when.** When you enable OpenRouter mode, the FULL artifact under
review (your diff / plan / source) is sent verbatim to OpenRouter, which itself fans it out to the
configured providers (by default OpenAI + Google). So the artifact reaches **at least three
external parties.** There is no redaction and no size cap today (disclosure-only by choice — a
byte cap is a possible future hardening, not shipped). And because the `orchestrate` skill reads
`xverify.json` and passes `crossModel` automatically, once enabled the egress happens on every
**`adversarial-verify`** run, not as a per-artifact opt-in. (Only `adversarial-verify` wires
`crossModel`; **`judge-panel` performs NO cross-model egress** — it has no cross arm.) Do not enable
it for artifacts that must not leave your machine; prefer the codex-MCP mode (no OpenRouter proxy)
when you only need a GPT cross-check.

**Secrets.** `OPENROUTER_API_KEY` is read from the environment of the fusion MCP process — a
process that also ingests attacker-controlled artifacts. Use a **dedicated, spend-capped, minimal-
scope** OpenRouter key and recognize it persists in that process's environment. NOTE: the fusion MCP
is **user-scoped and spawned by the Claude host**, so it inherits the **host's** environment at
spawn — a `export` in some other interactive shell does not reach it (and does not isolate it). The
effective controls are: a dedicated spend-capped key, and **removing/disconnecting the fusion MCP
when not in use** (`./install.sh --uninstall` or unregister it), rather than assuming a per-shell
export scopes the key away from the running server.
