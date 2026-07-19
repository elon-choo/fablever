# Models — which ones, why, and how they stay current

fablever keeps its cross-model verification on the **latest validated high-performance
models**, while keeping published results honest. Two ideas do all the work:

1. **`active` ≠ `reported`.** [`models.json`](models.json) separates the models in use *now*
   (`active`, the latest) from the exact models that produced the published numbers
   (`reported_in_whitepaper`). The whitepaper's 18/18 was measured with GPT-5.2 +
   Gemini-2.5-pro; relabeling it with newer models would be fabrication, so those stay frozen.
   New work uses `active`.
2. **Adoption is eval-gated.** A newer model becomes `active` only after it passes a
   defect-catch validation on the repo fixture — never by silently swapping to "whatever is
   newest." Silent auto-swap would break reproducibility and is a supply-chain risk.

---

## Current pins (`models.json` → `active`) — 2026-06-16

| Role | Model | Endpoint | Notes |
|------|-------|----------|-------|
| Claude worker | `opus` | Workflow tool | latest Claude Opus available to Claude Code |
| Gemini worker / judge | `gemini-3.1-pro-preview` | `generateContent` | live-probed OK |
| OpenAI adjudicator / judge | `gpt-5.5` | `chat/completions` | live-probed OK |

> **Why not `gpt-5.5-pro`?** It is **not a chat model** — it requires `/v1/responses` (or
> `/v1/completions`), which this pipeline's chat path doesn't use. It is recorded as
> `families.openai.max_quality` and can be wired once that endpoint is supported. Pinning it
> on the chat path would error.

The whitepaper (`whitepaper/03-results.md`) still reports **gpt-5.2 + gemini-2.5-pro** — the
models that actually produced its numbers. To cite results with the newer pins, **re-run the
eval** ([`../eval`](../eval), `whitepaper/07-reproduce.md`); don't relabel.

---

## Execution mode — `FABLE_ULTRA` = `auto` | `on` | `off`

The heavy cross-model / panel path is expensive ([whitepaper §4.4](../whitepaper/04-max-quality-config.md));
the resolver [`lib/mode.mjs`](lib/mode.mjs) decides when to spend it.

- **`off`** — always the cheap prompt-matched single agent (A2).
- **`on`** — always the heavy panel / ULTRA path.
- **`auto`** (default) — **cheap by default**, escalating to heavy **only** on stakes signals:
  security / auth / payment / crypto / migration / release / "audit" / "thorough" / large or
  many artifacts (English + Korean keywords). So easy tasks never silently burn cost.

Precedence: env `FABLE_ULTRA` > `~/.claude/fable-profile/mode.json` (`{"ultra":"auto"}`) >
default `auto`. The `auto` gate is an honest heuristic, not a guarantee — `on`/`off` always
override. Self-test: `node orchestration/lib/mode.mjs --selftest`.

### Explicit task-category cost route (`auto` only)

[`lib/tier-routing.mjs`](lib/tier-routing.mjs) adds an inert unit API for callers that already
have an explicit task category. Calling `routeTaskCategory(category)` while
`FABLE_ULTRA=auto` reads the `cost_routing` block in the existing [`models.json`](models.json);
`on` and `off` do not activate category routing. Merely installing fablever or leaving the
mode at `auto` does not dispatch this path.

| task category | selected tier | ordered fallback chain |
|---|---|---|
| `mechanical-edit` | `lower-cost` → Codex delegation | `lower-cost` → `opus` |
| `bounded-code-change` | `lower-cost` → Codex delegation | `lower-cost` → `opus` |
| `deterministic-check` | `lower-cost` → Codex delegation | `lower-cost` → `opus` |
| `judgment` | `opus` | `opus` |
| unknown / blank (`UNCLASSIFIED`) | `opus` fallback | `opus` |

The category names and chains live only in `models.json`. The `opus` tier resolves
`active.worker_claude`; the lower-cost tier names a Codex delegation target and introduces
no second model pin. This is a spend policy only. It makes no claim about output quality,
capability, accuracy, or task success.

---

## Staying current — detect → validate → adopt (daily, token-safe)

[`lib/model-freshness.mjs`](lib/model-freshness.mjs) keeps `active` fresh **without** costing
tokens per chat:

1. **Detect (daily, ~0 tokens).** Calls only the providers' **model-list** endpoint (no
   generation) and is **rate-limited to once / 24h** via `~/.claude/fable-profile/model-check.json`.
   It flags ids that are a newer same-class flagship than the current pin (e.g. `gpt-5.6`, or
   `gemini-3.5-pro`), excluding non-chat (`-pro`), `-mini`/`-nano`/`-codex`, and `flash`/`lite`.
   ```bash
   node orchestration/lib/model-freshness.mjs check     # daily-gated; --force to bypass
   node orchestration/lib/model-freshness.mjs status     # active pins + last check + candidates
   ```
2. **Validate (eval gate).** A candidate reviews fixture artifacts; the pinned judge scores
   defect-catch vs the planted defects. The bar is **validated-to-work + no catastrophic recall
   regression** — adoption favors the latest model and does **not** require beating the prior peak
   recall (a newer model may trade recall for precision; if so, both runs are recorded and the
   whitepaper keeps the models that produced its numbers). See `models.json` → `validation.gate`.
   ```bash
   node orchestration/lib/model-freshness.mjs validate gpt-5.6
   ```
3. **Adopt (gated write).** On pass, `active[role]` is updated and the result recorded in
   `validation.history`. `reported_in_whitepaper` is never touched.
   ```bash
   node orchestration/lib/model-freshness.mjs adopt adjudicator gpt-5.6     # validates first
   ```

### The daily trigger

The SessionStart hook [`claude-code/hooks/fable-model-check.js`](../claude-code/hooks/fable-model-check.js)
reads the cached result (instant, zero cost) and **surfaces a notice** when a newer model was
detected, then refreshes in a **detached** background process (so session start never blocks).
It is **fail-open** and disabled by `FABLE_MODELCHECK=off` or `FABLE_PROFILE=off`. Adoption is
deliberately **not** silent from the hook — it runs the eval gate when you invoke `adopt`
(keep `adopt` automated via a cron/launchd job if you want hands-off, eval-gated updates).

> **Why not just always use the newest model the instant it appears?** Because "newest" ≠
> "validated for this task," and silently swapping the model under your results breaks
> reproducibility and pulls in an unvetted model (a supply-chain risk). Detect-then-validate
> gives you "always current" **and** "always checked."
