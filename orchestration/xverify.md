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
| **[C] Codex MCP** | `./install.sh --with-xverify=codex` | uses your ChatGPT/Codex subscription quota (no OpenRouter key). Needs the codex MCP connected. |

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
export FABLE_XVERIFY=off          # force-disable for this shell, even if configured
./install.sh --with-xverify=off   # persist "off"
./install.sh --with-xverify=openrouter   # re-enable
```

`FABLE_FUSION=off` also disables the OpenRouter path (the cross-verify tool lives on the
fusion server).

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

## Supply-chain note

The cross-verify tool reuses the existing zero-dependency `fusion-server.js` (built-in
`fetch`, no npm packages, no postinstall). It is the **only** network/key surface, isolated in
the optional fusion MCP — the core orchestration recipes stay zero-network when cross-verify is
off. It sends your artifact to a third-party proxy (OpenRouter) only when *you* enable it and
only for the calls you trigger; don't enable it for artifacts that must not leave your machine.
