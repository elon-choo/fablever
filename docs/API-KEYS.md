# API keys & authentication — for the cross-model features

> **한국어 요약.** fablever의 **핵심(작업 스타일 + 오케스트레이션)은 키가 전혀 필요 없습니다** — Claude
> Code 안에서 당신의 Claude 인증으로 그냥 돕니다. **다른 모델(GPT·Gemini) 교차검증 / ULTRA 파이프라인을
> 쓸 때만** 키가 필요하고, 이때는 **API 키(BYOK, 본인 키)** 방식입니다. **ChatGPT·Gemini 앱(소비자)
> 로그인으로는 API가 안 됩니다** — API는 별도 결제 계정이 필요합니다. 유일한 예외는 **codex MCP** 경로로,
> 이건 ChatGPT 로그인을 그대로 씁니다(별도 키 불필요). 키는 절대 커밋하지 말고 환경변수(`~/.zshrc`)에 두세요.

This document is for anyone who installs fablever and wants the **optional cross-model
verification** (subsystem C) or the **ULTRA** max-quality pipeline. The core profile and the
Claude-only orchestration recipes need **none** of this.

---

## 1 · What needs a key, and what doesn't

| Feature | Needs a key? | Which |
|---------|--------------|-------|
| Behavioral profile (always-on style) | **No** | runs on your existing Claude Code auth |
| Orchestration recipes (Claude-only: `adversarial-verify`, `judge-panel`, …) | **No** | the Claude workers run via Claude Code's Workflow tool |
| Cross-model verification (`fable_cross_verify`, the off-by-default arm) | **Yes** | a non-Claude model key (below) |
| ULTRA pipeline (GPT/Gemini generation + adjudication + judges) | **Yes** | OpenAI and/or Google keys |

The Claude **worker** never needs a separate Anthropic API key for the in-Claude-Code path —
it uses the same auth your Claude Code session already has.

---

## 2 · It is BYOK (bring your own API key) — NOT a consumer login

This is the most common point of confusion, so it is stated plainly:

- **A ChatGPT Plus/Pro subscription does NOT grant API access.** The OpenAI *API* is a
  separate, separately-billed product (platform.openai.com) with its own key and credits.
- **A Gemini app (consumer) login does NOT grant API access.** The Gemini *API* key comes
  from Google AI Studio (aistudio.google.com), separately.
- So for the direct OpenAI/Google paths you need **platform API keys**, not your app login.

### The one exception — the codex MCP path uses your ChatGPT login

If you wire the cross-model GPT reviewer through the **codex MCP** (`mcp__codex__codex`)
instead of the OpenAI API, it runs under your **codex CLI / ChatGPT authentication** — no
separate OpenAI API key needed. This is the only "use my account login" route, and it only
covers the GPT reviewer, not Gemini. fablever supports it: `install.sh --with-xverify=codex`.

#### Set up the codex MCP (the no-API-key GPT reviewer)

The codex MCP is OpenAI's official **Codex CLI** ([github.com/openai/codex](https://github.com/openai/codex))
running as a local MCP server under your ChatGPT login. You need a **ChatGPT account**
(Plus/Pro/Team/Enterprise) — **no OpenAI API key**. Three commands, once:

```bash
npm install -g @openai/codex      # OpenAI's official Codex CLI (verify scripts before global installs)
codex login                       # opens a browser — sign in with your ChatGPT account
claude mcp add --transport stdio codex --scope user -- codex mcp-server
claude mcp list                   # confirm the line:  codex … ✔ Connected
```

Then `./install.sh --with-xverify=codex` (or pick **gpt-oauth** in first-run setup) routes the GPT
reviewer through it. Check status anytime with `codex login status` and `codex doctor`. If
`claude mcp list` does **not** show `codex ✔ Connected`, the GPT reviewer is not wired yet — re-run
`codex login` and the `claude mcp add` line above. This is the **only** preset that does not touch
an API key.

---

## 3 · How to get & set each key

```bash
# OpenAI (GPT-5.x adjudicator/judge) — platform.openai.com/api-keys  (NOT chatgpt.com)
export OPENAI_API_KEY=sk-proj-...

# Google Gemini (gemini-3.1-pro-preview worker/judge) — aistudio.google.com/apikey
export GEMINI_API_KEY=...        # GOOGLE_API_KEY is also accepted

# Optional aggregator: one key, many models — openrouter.ai/keys
export OPENROUTER_API_KEY=sk-or-v1-...
```

Put these in the rc file your login shell actually reads — `~/.zshrc` (zsh, the macOS default) or
`~/.bashrc` / `~/.bash_profile` (bash, most Linux), then open a new session — **or** pass them to the
fusion module's config. **Never commit a key**; never paste one into a doc or an issue.

### Choosing a provider path

| Path | Auth | Good when |
|------|------|-----------|
| **OpenAI API** (direct) | `OPENAI_API_KEY` | you want GPT-5.x as adjudicator/judge |
| **Google Gemini API** (direct) | `GEMINI_API_KEY` | you want a different-weights worker/judge |
| **OpenRouter** (aggregator) | `OPENROUTER_API_KEY` | you want one key for many models (used by the Fusion module) |
| **codex MCP** | your ChatGPT login | you'd rather not manage an OpenAI API key |

---

## 4 · Cost & safety notes

- **Zero overhead when off.** With no cross-model arm enabled, fablever needs **no** keys and makes
  **no** cross-model network calls — the branch is the absence of an argument, not a flag checked and
  skipped. (The only network the default does at all is an anonymous once/24h version check that uses
  no key — `FABLE_UPDATE_CHECK=off` to disable.) Toggle: `FABLE_XVERIFY=off`, `FABLE_FUSION=off`.
- **Key/content surfaces are all opt-in; the default install reaches none of them.** The
  cross-model arm's surface is the zero-dependency `fusion/fusion-server.js` (built-in `fetch`, no
  npm deps, no `postinstall`) — read it before trusting it with a key.
- **The model-freshness refresh** ([`orchestration/MODELS.md`](../orchestration/MODELS.md)) uses
  only the providers' **model-list** endpoint (no generation), at most **once per 24h** —
  effectively zero token cost. It is **opt-in** (`FABLE_MODELCHECK_REFRESH=on`, or
  `npm run model:check`) and is skipped if no key is set; by default the model-check hook only
  reads a cached file, with no network call and no credential read.
- **A hostile artifact is a prompt-injection vector.** A cross-model "all clear" is bonus
  coverage, never authoritative — it never changes the runtime RED gate.

---

## 5 · Quick start (cross-model on)

```bash
# 1. get keys (section 3) and export them in ~/.zshrc
# 2. enable the cross-model arm with a key, or via codex
./install.sh --with-xverify=openrouter      # or: --with-xverify=codex   (ChatGPT login)
# 3. restart Claude Code. Disable anytime: export FABLE_XVERIFY=off
```

Full provider/cost menu and the kill-switches are in
[`orchestration/xverify.md`](../orchestration/xverify.md).
