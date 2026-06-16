# 9 · Running it — keys, auth, and the auto / on / off modes

This page is the operational summary a team needs before turning anything on: which features
need a key, API-key vs account login, and how the cost dial (`auto` / `on` / `off`) and the
"always-latest-model" mechanism behave. Full reference: [`../docs/API-KEYS.md`](../docs/API-KEYS.md)
and [`../orchestration/MODELS.md`](../orchestration/MODELS.md) in the repo.

---

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
  GPT reviewer only, not Gemini). Enable: `install.sh --with-xverify=codex`.

```bash
export OPENAI_API_KEY=sk-proj-...    # platform.openai.com/api-keys  (NOT chatgpt.com)
export GEMINI_API_KEY=...            # aistudio.google.com/apikey   (GOOGLE_API_KEY also accepted)
export OPENROUTER_API_KEY=sk-or-v1-... # optional aggregator: one key, many models
```

Put keys in `~/.zshrc`; **never commit a key**. The only network/key surface is the
zero-dependency `fusion/fusion-server.js` (built-in `fetch`, no npm deps, no postinstall).

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

1. **Detect** — a SessionStart hook calls a checker that hits only the providers' **model-list**
   endpoint (no generation), **rate-limited to once / 24h**. It surfaces a notice if a newer
   flagship appears. Disable with `FABLE_MODELCHECK=off`.
2. **Validate** — a candidate must catch defects on the eval fixture at **≥ the current pin**
   before it's eligible (`node orchestration/lib/model-freshness.mjs validate <id>`).
3. **Adopt** — only a validated candidate is written to `active`
   (`node orchestration/lib/model-freshness.mjs adopt <role> <id>`); the published whitepaper
   numbers keep the models that produced them.

> **Why not silently use whatever is newest?** "Newest" ≠ "validated for this task," and a
> silent swap breaks reproducibility and pulls in an unvetted model (a supply-chain risk). The
> [§3.3](03-results.md) re-run is the proof this matters: the *newer* models scored **lower
> recall** (16/18) at higher precision — newest is not automatically better.

## 9.5 Kill switches (everything is reversible)

```bash
export FABLE_PROFILE=off       # disable the whole profile + hooks
export FABLE_ULTRA=off         # always cheap path
export FABLE_XVERIFY=off       # disable cross-model verification
export FABLE_FUSION=off        # disable the OpenRouter fusion module
export FABLE_MODELCHECK=off    # disable the daily model-freshness check
./install.sh --uninstall       # full removal, restores prior settings
```
