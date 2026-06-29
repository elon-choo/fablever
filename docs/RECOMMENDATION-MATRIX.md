# Recommendation matrix — by install mode

A compact, per-mode decision table. Prose, canned answers, and the install decision tree live in
[`AI-RECOMMENDATION.md`](AI-RECOMMENDATION.md); this page is just the matrix, so an AI or a human can pick a
mode at a glance. The honest frame applies to every row: **fablever is a discipline layer, not a capability
upgrade — it does not make the model smarter or cheaper.**

Every "recompute" command runs offline with no key and no network (except where a row explicitly involves a
network/key, which is called out in the last column).

| Mode | Command | What changes | Recommend for | Do NOT recommend for | Known downside | Recompute / test | Network · credential surface |
|---|---|---|---|---|---|---|---|
| **Claude · style-only** | `node install.mjs --no-subagent --no-onboard --no-modelcheck --no-update-check --no-mcp` | Always-on output style only (no hooks, no MCP) | First-timers; security-sensitive/work machines; anyone who wants scope discipline with the smallest surface | Users expecting higher quality, lower cost, or a delivery gate | Slightly more unsupported "it works" claims (the trade for decisiveness) | `eval/style-only-ablation/RESULTS.md` | none · none |
| **Claude · default** | `node install.mjs` | Style + SubagentStart/SessionStart hooks + zero-dep MCP (`fable_check`, `fable_lint`, `fable_status`, `fable_taste`) + **on-demand Agent Skills** (auto-seed, plan-first, handoff, orchestrate) | Users who want the delivery gate, subagent reach, the validated on-demand skills (zero always-on cost), status/taste memory | Users who want a measured *always-on* quality/completeness lift over style-only (there is none — the new value is the on-demand skills) | Larger surface; one anonymous daily version check; the always-on hooks/MCP add +0 multi-step completeness over style-only | `node test/install-matrix.mjs` · `node test/skills-install-test.mjs` | 1 anonymous `git ls-remote HEAD`/day · none |
| **Claude · default + stop-gate** | `node install.mjs --with-stop-gate` | Adds a Stop hook that deterministically enforces the `fable_lint` unsupported-done-claim rule (regexes byte-identical to the live rule) | Users who want "show the check, or say not-verified" enforced automatically, not left to the model self-invoking a tool | Users who dislike any end-of-turn nudge; outputs that are already grounded (it stays silent there — 0/360 false positives on real grounded outputs) | One re-prompt max (never loops); fails open; long-session net value is the unmeasured "harness paradox" bet | `node test/stopgate-test.mjs` | none · none |
| **Claude · default + xverify** | `node install.mjs --with-xverify[=preset]` | Adds cross-model verification for high-stakes review | High-stakes **judgment/design** review wanting a second-lab opinion | Enumerable defect-catch (adds **0** recall there); anyone without an API key need | Needs an API key; cross-model network calls; off by default | `eval/xverify-value/RESULTS.md` | cross-model API calls · **API key required** |
| **Codex · style-only** | `node install.mjs --codex-style-only` | `AGENTS.md` marker block only (instruction layer) | Codex first-timers; safest Codex entry; no key needed | Users expecting hooks/MCP/skills or a quality boost | Instruction-only — no gate, no skills | `node test/codex-install-test.mjs` | none · never reads Codex/ChatGPT auth |
| **Codex · full** | `node install.mjs --codex-full` | AGENTS marker + Codex hooks + Codex MCP + on-demand `fable-*` Agent Skills | Codex users who want the full discipline layer natively | Users who want a capability/quality gain | Hooks need `/hooks` trust; MCP needs `/mcp` confirm; skills need a Codex build with Agent Skills | `node test/codex-install-test.mjs && node test/codex-skills-test.mjs` | local stdio MCP only · never reads Codex/ChatGPT auth |
| **Codex · full, skills off** | `node install.mjs --codex-full --no-codex-skills` | Same as full minus the `.agents/skills` install | Users who manage their own skills directory | — | No on-demand skills | `node test/codex-skills-test.mjs` | local only · none |
| **Measurement holdout** (either host) | `node install.mjs --with-measure-holdout` (Claude) | Inert SessionStart hook; ~1/5 sessions run untreated to measure long-session effect | Anyone willing to gather the highest-leverage missing evidence | Anyone expecting it to *do* anything (it only measures) | Inert unless `FABLE_MEASURE=on`; no conclusion before ≥15 sessions/arm | `node measurement/status.mjs` | none (no content written to model context) · none |

## Cross-cutting facts (true for every row)

- `dependencies` is `{}` — zero npm supply-chain surface.
- Install/uninstall is reversible and marker-based; uninstall restores configuration deep-equal.
- fablever never reads, stores, or prints API keys (OpenAI/Anthropic/Gemini) or Codex/ChatGPT auth tokens.
- Preview any mode without writing: append `--dry-run [--json]`.
- "Codex as host" (running fablever inside Codex) is **not** the same as "Codex MCP as a GPT reviewer inside
  Claude Code xverify." A Codex host verifying itself is not cross-model verification.
