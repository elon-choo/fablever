# Fable Fusion (optional, off by default)

A thin, **opt-in** bridge from Fable Profile to [OpenRouter Fusion](https://openrouter.ai/docs/guides/features/plugins/fusion):
a panel of models (default **Opus + GPT + Gemini**) answers your prompt in parallel, a **judge** compares
them (consensus / disagreements / unique insights / blind spots), and a final answer is synthesized —
"Fable-like performance" by fusing several models. The fused answer is itself written in the Fable working
style.

> **This is the one part of Fable Profile that touches the network and needs an API key.** It is **off by
> default** and fully isolated. The core (output style, hooks, `mcp/src/server.js`) still makes **no**
> network calls and needs **no** keys — turning Fusion on doesn't change that; it adds a *separate* MCP
> server you can remove anytime.

## Authentication: API key, not OAuth login

Short answer: **you use an API key. You cannot "log in with your ChatGPT or Gemini account."**

| Method | Works for Fusion? | What it is |
|---|---|---|
| **OpenRouter API key** (`OPENROUTER_API_KEY`) | ✅ **Required** | A Bearer token from [openrouter.ai/keys](https://openrouter.ai/keys). This is the only credential the client needs. OpenRouter routes to GPT/Gemini/Claude for you and bills your OpenRouter credits. |
| **BYOK** (Bring Your Own Key) | ✅ Optional | Add your *own* OpenAI / Google API keys in the OpenRouter dashboard so panel calls run on your provider accounts. Keys stay **server-side** in OpenRouter; your client still only sends the OpenRouter key. |
| **OAuth account login** (log in with OpenAI/Google) | ❌ Not supported | There is no "sign in with your ChatGPT/Gemini account" path. OpenRouter's OAuth (PKCE) only exists so an *app* can mint an OpenRouter **API key** on a user's behalf — the result is still an API key, not provider-account auth. |

So: **one OpenRouter API key is enough.** BYOK is only if you'd rather pay OpenAI/Google directly for the
panel models instead of OpenRouter credits — and even then it's API keys (or a Google Vertex service-account
JSON), never an interactive OAuth login.

## Environment setup

1. Create an OpenRouter account and add credits (or set up BYOK below).
2. Get an API key at <https://openrouter.ai/keys>.
3. Export it where Claude Code (and the MCP server) will see it — e.g. in `~/.zshrc` or `~/.env`:
   ```bash
   export OPENROUTER_API_KEY="sk-or-v1-..."
   ```
   If your Claude Code launch doesn't inherit your shell env, register the server with the key inline
   instead (stored in `~/.claude.json`, plaintext — prefer the env-var approach):
   ```bash
   claude mcp add --transport stdio fable-fusion --scope user \
     --env OPENROUTER_API_KEY="sk-or-v1-..." -- node /abs/path/to/fusion/fusion-server.js
   ```
4. Enable the module:
   ```bash
   ./install.sh --with-fusion      # registers the fable-fusion MCP server
   # restart Claude Code, then /mcp should list fable-fusion
   ```

### Optional: BYOK for GPT and Gemini

To run the panel on your own provider accounts (billed by OpenAI/Google, not OpenRouter credits):

1. Open your [OpenRouter BYOK settings](https://openrouter.ai/settings/integrations).
2. **OpenAI (GPT):** paste your OpenAI API key.
3. **Google (Gemini):** for Vertex, upload a service-account key JSON (Google Cloud Console → IAM & Admin →
   Service Accounts → create key → JSON). For Google AI Studio, paste that API key.
4. Your client config is unchanged — you still only set `OPENROUTER_API_KEY`. Provider keys stay server-side.

## Use it

Once enabled, the model can call the `fable_fusion` tool (or you can ask: *"use fusion to compare answers
on …"*). Parameters:

- `prompt` (required) — the question to deliberate on.
- `analysis_models` (optional) — 1–8 panel model slugs, e.g. `["anthropic/claude-opus-4.8", "openai/gpt-5.5", "google/gemini-2.5-pro"]`. Omit for OpenRouter's default Quality panel (Opus + GPT + Gemini).
- `judge_model` (optional) — model that compares the panel and writes the final answer.
- `fable_style` (optional, default `true`) — steer the fused answer with the Fable working style.
- `include_analysis` (optional) — also return model/usage metadata.

## Cost

You pay the **cumulative** cost: every panel completion + the judge + the final answer. A 3-model panel is
~4–5 completions per query. Use Fusion for hard or high-stakes questions where a second and third opinion is
worth it — not for routine work.

## Turn it off / remove

```bash
export FABLE_FUSION=off                 # disable the tool without unregistering
./install.sh --uninstall                # removes fable-fusion (and everything else)
# or just: claude mcp remove fable-fusion --scope user
```

## Test

```bash
node test/fusion-test.js   # protocol + all error paths (disabled / no key / empty prompt) — makes NO network calls
```
