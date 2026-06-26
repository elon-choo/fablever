# Changelog

All notable changes to fablever. Format follows [Keep a Changelog](https://keepachangelog.com/); this
project has no published version tags yet, so dated sections below reflect the working history. The honest
positioning is unchanged throughout: **a style/structure transplant, not a capability upgrade.**

## [Unreleased]

### Added
- **Codex Agent Skills.** Five on-demand `fable-*` skills under `.agents/skills/` — `fable-scope-guard`,
  `fable-delivery-gate`, `fable-evidence-done`, `fable-review`, `fable-seed`. `--codex-full` installs them
  into the Codex discovery dir (`$HOME/.agents/skills` user scope, `<project>/.agents/skills` project scope);
  opt out with `--no-codex-skills`. Marker-free but record-tracked reversibility: uninstall removes only the
  `fable-*` dirs it installed and preserves any user-authored skill. Self-copy guard prevents clobbering the
  repo's own skills when installing from inside fablever.
- **Local diagnostics.** `node tools/fable-doctor.mjs` (read-only install-state report across Claude + Codex,
  with a recommended next action) and `node tools/fable-report.mjs` (honest evidence digest + measurement
  campaign status). Both `--json`-capable; neither reads any key or token. Scripts: `npm run doctor`,
  `npm run report`.
- **Discovery & trust docs.** `llms.txt` (short machine-readable recommendation surface),
  `docs/RECOMMENDATION-MATRIX.md` (per-mode table), `docs/EXAMPLES.md` (before/after, including where it does
  not help), `SECURITY.md` (data flow + threat model), `PRIVACY.md` (egress summary).

### Changed
- `--codex-status` now reports installed skills; the Codex install/uninstall summary mentions `/skills`.
- `package.json` `files` now ships `.agents/`; `npm test` and CI run `test/codex-skills-test.mjs`.

### Tests
- `test/codex-skills-test.mjs` — 35 checks: discovery-dir install, opt-out, style-only ships none,
  record-tracked uninstall preserving user skills, empty-dir pruning, project scope, in-repo self-copy guard
  (dry-run), dry-run writes nothing, and honest frontmatter on every shipped SKILL.md.

### Unchanged (guarantees preserved)
- `dependencies` stays `{}`. Claude Code install path is byte-for-byte unaffected. No new credential reads,
  no new default network egress. Every new automation is reversible and has a `--dry-run` or test.

## [1.2.0] — 2026-06

### Added
- **Codex CLI native support** — `AGENTS.md` marker block, Codex hooks (`SessionStart`/`SubagentStart`,
  optional `UserPromptSubmit`), and Codex MCP via `config.toml`, all marker-based and reversible. Flags:
  `--codex-style-only`, `--codex-full`, `--codex-scope`, `--no-codex-*`, `--codex-with-reinject`,
  `--codex-patch-override`, `--force-codex-mcp`, `--codex-status`, `--uninstall --codex`. Never reads or
  prints Codex/ChatGPT auth.
- **AI-recommendation surface** — `docs/AI-RECOMMENDATION.md`, README decision box, and per-mode guidance so
  an AI recommends the safest install first and does not oversell.
- **`fable_lint` `unsupported-done-claim` rule** — flags "it works"/"done"/"fixed"/"verified" claims with no
  evidence (EN + KO); label regression in `eval/unsupported-claim-regression/`.
- **MCP host-aware mode + `instructions`** — server reports Codex vs Claude state and ships server-wide
  guidance in the initialize response.
- `--dry-run [--json]` preview for every install/uninstall; opt-in long-session measurement holdout.

## [1.1.0] — 2026-06

### Added
- Universal Node installer (`install.mjs`) with native Windows support; daily anonymous update check;
  adaptive model-freshness layer; cross-model verification presets (incl. GPT-via-ChatGPT-login) with
  opt-in, environment-only key handling; OpenRouter Fusion module (off by default).
- Trust package: developer productivity A/B (a published null), style-only ablation, install-safety and
  privacy canary tests; orchestration layer + eval harness; renamed to **fablever**.

## [1.0.0] — 2026-06-15

### Added
- Initial release: always-on Claude Code output style that adopts Claude Fable 5's working style, plus a
  zero-dependency MCP and a `SubagentStart` hook reaching subagents and background agents.
