# Changelog

All notable changes to fablever. Format follows [Keep a Changelog](https://keepachangelog.com/); this
project has no published version tags yet, so dated sections below reflect the working history. The honest
positioning is unchanged throughout: **a style/structure transplant, not a capability upgrade.**

## [Unreleased]

### Added (Opus-upgrade track — all opt-in, default-off)
- **Evidence-grounded completion scaffolding**, added as a stage×goal upgrade and each gated by a
  deterministic test: cost instrumentation (per-arm tokens/wall-clock/fixture-hash), a hidden-oracle hard
  fixture, pre-registration binding + a magnitude-claim lint, a deterministic retry/iteration budget,
  falsifiable read-only verifiers, a pre-flight route-vs-solo cost gate, a single writable run authority
  (contract + append-only ledger), criterion-bound evidence receipts, the **bounded verified-completion
  loop** (completion repaired only by an executable check PASS; retry only by a check FAIL, repair-only),
  compaction/restart recovery, an active-run doctor, progress-aware two-strike continuation, and cost-only
  task-category model routing. See `docs/VERIFIED-LOOP.md` and `EVIDENCE.md` (§ Opus-upgrade opt-in
  mechanisms). A default v1.3.0 install is behavior-unchanged (opt-in audit + v1.3.0 snapshot enforce it).
- **No effect-size is claimed.** The A/B and holdout experiments that would measure whether these help on a
  stronger model have **not** been run — they are budget- and measurement-gated. The verified-loop A/B is
  pre-registered; each remaining experiment binds its own pre-registration before it runs. What ships is the
  mechanism and its guardrails, not a result. Positioning is unchanged: a structure transplant, not a
  capability upgrade.

## [1.3.0] — 2026-07-02

### Added
- **Proportionality meta-principle for conflict resolution.** Added *"Use proportionality to resolve
  conflicts"* to the working-style profiles (`profiles/full.md`, `profiles/compact.md`, `profiles/core.md`):
  apply the strongest rule matching the task's actual risk and scope, and don't let newer discipline erase
  the older principles — safety, destructive-action caution, explicit user/project rules, and host
  approval/sandbox rules outrank decisiveness; format and length caps constrain prose only and never cut the
  P5 evidence check or P7 decision trail; preambles/progress notes are gated by task length (silent for
  single-step, one short preamble plus factual notes for three-or-more-step, private reasoning never
  narrated); early-stop limits search breadth only, not grounding depth; verification strength scales with
  blast radius. Enforced by five new `fable_lint` conflict guards (`missing-safety-precedence`,
  `missing-cap-evidence-trail-exemption`, `missing-preamble-task-gate`, `missing-early-stop-grounding-depth`,
  `missing-verification-proportionality`) that fire only when a profile/discipline-upgrade draft states both
  sides of a conflict without the resolving hierarchy; conflict-regression eval in `eval/conflict-regression/`.
  Propagated to the shipped codex fragment (`codex/AGENTS.fable.md`), the Claude subagent brief, the three
  Codex hook fallbacks, and both READMEs.
- **Per-host optimal-stack redefinition.** The default install now applies the evidence-optimal stack for
  each host, grounded in our A/Bs and the only rigorous public studies (ETH AGENTbench
  [arXiv:2602.11988](https://arxiv.org/abs/2602.11988); AGENTS.md efficiency
  [arXiv:2601.20404](https://arxiv.org/html/2601.20404v2)), which independently confirm the thesis: a lean
  instruction layer is the lever, capability bulk is a measured cost. Decision + competitor comparison:
  [`docs/OPTIMAL-STACK.md`](docs/OPTIMAL-STACK.md).
- **Claude Code Agent Skills, now actually installed.** `claude-code/skills/*` (`fable-seed`, `fable-plan`,
  `fable-handoff`, `orchestrate`) existed in the repo but the installer never delivered them; the default
  install now copies them to `~/.claude/skills/` behind a `.fable-skill` ownership marker (uninstall removes
  only ours; a user-authored skill of the same name is left verbatim). Suppressed under style-only and
  `--no-skills`. Zero always-on cost — a skill is inert until the model pulls it. (`test/skills-install-test.mjs`, 13/13)
- **`fable-plan` skill (plan-first).** Ships the A/B-validated plan-first technique (hard multi-step, 9–1,
  p=0.022) as an on-demand skill for both hosts, trigger-gated to hard work (a no-op on simple tasks).
- **Opt-in deterministic stop-gate (`--with-stop-gate`).** A Claude Code Stop hook that compiles the
  validated `fable_lint` unsupported-done-claim rule (regexes byte-identical to `mcp/src/server.js`) into
  deterministic enforcement, so it fires without the model self-invoking the MCP tool — closing the style's
  one measured cost (more unsupported "it works" claims, 8.3% vs 2.1%). One nudge, never loops, fails open;
  kill switch `FABLE_STOP_GATE=off`. (`test/stopgate-test.mjs`, 17/17)
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
