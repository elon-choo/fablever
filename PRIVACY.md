# Privacy

fablever is local-first. This page summarizes exactly what does and does not leave your machine. It is the
data-flow companion to [`SECURITY.md`](SECURITY.md); both are verifiable from committed tests.

## What leaves your machine

| Install mode | Network egress | Contains |
|---|---|---|
| Claude **style-only** | **none** | — |
| Claude **default** | one anonymous `git ls-remote HEAD`/day vs the public repo | a Git ref request only — no key, no code, no prompt, no identifier. Disable with `--no-update-check`. |
| Codex **style-only / full** | **none** beyond a best-effort local `codex --version` detection | — (the fable-profile MCP runs locally over stdio) |
| Opt-in **xverify / fusion** (off by default) | cross-model API calls to the provider you configure | the content you send for review. Requires an API key; you opt in explicitly. |
| **Measurement holdout** (opt-in) | **none** | the ledger records outcome signals (counts, timings) — never your prompts, code, or any content. |

## What never leaves your machine

- **No credentials, ever.** No API key (OpenAI / Anthropic / Gemini / OpenRouter) and no Codex/ChatGPT auth
  token (`auth.json`, `CODEX_ACCESS_TOKEN`) is read, stored, or transmitted by the core install.
- **No source code or prompts** are sent anywhere by the default install. The daily version check carries
  only a Git ref request.
- **`taste.json`** (the `fable_taste` preference memory) is a **local** file. Do not store secrets in it; it
  holds working-style preferences, not credentials.

## Verify it yourself

```bash
node test/privacy-canary/run.mjs        # 16/16: one anonymous git ls-remote; no key/code leaves
node test/codex-install-test.mjs        # Codex: planted token → 0 leak; auth.json untouched
node tools/fable-doctor.mjs             # read-only: shows what is installed; reads no tokens
```

## Key hygiene

Never paste an API key or auth token into a prompt, a `taste.json`, or any file fablever writes. If you
enable xverify/fusion, set the key in your shell environment (`~/.zshrc`); fablever reads it at call time
and does not persist it. Codex login is managed entirely by Codex — run `codex` or `codex login` yourself if
a model call reports you are signed out.
