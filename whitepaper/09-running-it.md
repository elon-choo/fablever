# 9 · Running it — keys, auth, and the auto / on / off modes

This page is the operational summary a team needs before turning anything on: which features
need a key, API-key vs account login, and how the cost dial (`auto` / `on` / `off`) and the
"always-latest-model" mechanism behave. Full reference: [`../docs/API-KEYS.md`](../docs/API-KEYS.md)
and [`../orchestration/MODELS.md`](../orchestration/MODELS.md) in the repo.

---

## 9.0 First run — it asks you (no manual config)

You don't have to read the rest of this page to start. The first time you open Claude Code after
installing, fablever notices it isn't configured and **asks you two quick questions** — your cost
mode (`auto` / `on` / `off`) and whether to add a cross-model reviewer (Claude-only by default,
needs no key, $0). Your answers are saved under `~/.claude/fable-profile/` and the prompt never
repeats. New to API keys? The default needs none — say **"skip"** to take the recommended
defaults. Re-run setup anytime by deleting `~/.claude/fable-profile/onboarded`; silence the prompt
with `FABLE_ONBOARD=off`.

## 9.1 Does it need a key? (mostly no)

| Feature | Needs a key? | Which |
|---------|:---:|-------|
| Behavioral profile (always-on style) | **No** | runs on your existing Claude Code auth |
| Orchestration recipes (Claude-only) | **No** | Claude workers run via the Workflow tool |
| Cross-model verification (off by default) | **Yes** | a non-Claude model key (§9.2) |
| ULTRA max-quality pipeline | **Yes** | OpenAI and/or Google keys |

The Claude worker never needs a separate Anthropic API key for the in-Claude-Code path. With
the cross-model arm **off**, fablever makes **zero** network calls and needs **zero** keys.

## 9.2 API key (BYOK) — NOT a consumer login (one exception)

The most common confusion, stated plainly:

- **A ChatGPT Plus/Pro subscription does NOT grant API access.** The OpenAI *API* is a
  separate, separately-billed product (platform.openai.com) with its own key.
- **A Gemini app login does NOT grant API access.** The Gemini *API* key comes from Google AI
  Studio (aistudio.google.com).
- **The one OAuth/account-login exception:** routing the GPT reviewer through the **codex MCP**
  (`mcp__codex__codex`) runs under your **ChatGPT login** — no OpenAI API key needed (covers the
  GPT reviewer only, not Gemini). Enable: `install.sh --with-xverify=codex`. One-time setup (install
  the codex CLI, `codex login`, register the MCP) is in [`../docs/API-KEYS.md`](../docs/API-KEYS.md)
  § Set up the codex MCP.

```bash
export OPENAI_API_KEY=sk-proj-...    # platform.openai.com/api-keys  (NOT chatgpt.com)
export GEMINI_API_KEY=...            # aistudio.google.com/apikey   (GOOGLE_API_KEY also accepted)
export OPENROUTER_API_KEY=sk-or-v1-... # optional aggregator: one key, many models
```

Put keys in `~/.zshrc`; **never commit a key**. The only network/key surface is the
zero-dependency `fusion/fusion-server.js` (built-in `fetch`, no npm deps, no postinstall).

### The 4 reviewer presets — pick one, change anytime, it stays your default

Most people already have a ChatGPT account, so the second preset adds a GPT reviewer with **no
API key at all**. The first-run setup asks you to choose one; your choice persists.

| Preset | What it adds | What you must do |
|--------|--------------|------------------|
| **claude-only** *(default)* | nothing — same-family Claude panel | nothing ($0, no key, no login) |
| **gpt-oauth** | a GPT reviewer via your **ChatGPT login** (codex MCP) | set up codex (3 cmds, [docs/API-KEYS.md](../docs/API-KEYS.md)) — **no API key** |
| **gpt-oauth+gemini-api** | GPT via ChatGPT login **+** Gemini | ChatGPT login + a `GEMINI_API_KEY` |
| **gpt-api+gemini-api** | GPT **+** Gemini via API keys | one `OPENROUTER_API_KEY` (covers both) |

```bash
node orchestration/lib/xverify-preset.mjs show          # list presets (your default is marked ▶)
node orchestration/lib/xverify-preset.mjs set gpt-oauth  # change anytime — persists as the new default
node orchestration/lib/xverify-preset.mjs doctor         # checks if the needed key is set (never prints it)
```

**Security & "the AI does the rest":** the setup writes all config for you. You only do the
irreducible human steps — *issue a key* or *sign in*. **Never paste an API key into the chat**;
add it to `~/.zshrc` yourself (`export GEMINI_API_KEY=...`) and start a new session. `doctor`
reports only whether a key is *present* (true/false) — it never reads or echoes the value.

## 9.3 The cost dial — `FABLE_ULTRA` = `auto` | `on` | `off`

The heavy cross-model / panel path is expensive ([§4](04-max-quality-config.md)). This switch
decides when to spend it. Precedence: env `FABLE_ULTRA` > `~/.claude/fable-profile/mode.json`
(`{"ultra":"auto"}`) > default **`auto`**.

| Mode | Behavior |
|------|----------|
| **`auto`** (default) | **Cheap by default.** Escalates to the heavy panel/ULTRA path **only** on stakes signals — security / auth / payment / crypto / migration / release / "audit" / "thorough" / large or many artifacts (English + Korean keywords). So easy tasks never silently burn cost. |
| **`on`** | Always the heavy path. |
| **`off`** | Always the cheap prompt-matched single agent (A2). |

The `auto` gate is an honest heuristic, not a guarantee — `on`/`off` always override. Check a
decision: `node orchestration/lib/mode.mjs "review the auth token refresh"`.

## 9.4 Always the latest model — detect → validate → adopt (daily, ~0 tokens)

The models in use are pinned in [`../orchestration/models.json`](../orchestration/models.json)
(`active` = latest validated; currently **GPT-5.5** + **Gemini-3.1-pro-preview** + Opus). They
stay current without costing tokens per chat:

1. **Detect** — a SessionStart hook surfaces a notice if a newer flagship appears, reading a
   **cached state file**: **no network call and no credential read by default.** Refreshing that
   cache queries the providers' **model-list** endpoint (no generation, ≤ once/24h, using keys
   already in your env) and is **opt-in** via `FABLE_MODELCHECK_REFRESH=on` (or run
   `npm run model:check` yourself). Disable the hook entirely with `FABLE_MODELCHECK=off`.
2. **Validate** — a candidate is eval-run on the fixture before it's eligible; the bar is
   **validated-to-work + no catastrophic recall regression** (it need not beat the prior peak — a
   newer model may trade recall for precision, and if so both runs are recorded)
   (`node orchestration/lib/model-freshness.mjs validate <id>`).
3. **Adopt** — only a validated candidate is written to `active`
   (`node orchestration/lib/model-freshness.mjs adopt <role> <id>`); the published whitepaper
   numbers keep the models that produced them.

> **Why not silently use whatever is newest?** "Newest" ≠ "validated for this task," and a
> silent swap breaks reproducibility and pulls in an unvetted model (a supply-chain risk). The
> [§3.3](03-results.md) re-run is the proof this matters: the *newer* models scored **lower
> recall** (16/18) at higher precision — newest is not automatically better.

## 9.5 Kill switches (everything is reversible)

```bash
export FABLE_PROFILE=off       # turns off the fablever HOOKS (injections). NOTE: the always-on output
                               # STYLE is static and stays — to also turn that off, switch output style
                               # in /config, or run ./install.sh --uninstall for full removal.
export FABLE_ULTRA=off         # always cheap path
export FABLE_XVERIFY=off       # disable cross-model verification
export FABLE_FUSION=off        # disable the OpenRouter fusion module
export FABLE_MODELCHECK=off    # disable the daily model-freshness check
export FABLE_UPDATE_CHECK=off  # disable the daily anonymous GitHub version check
./install.sh --uninstall       # full removal, restores prior settings
```
