# Security

fablever is a **local** working-style layer with **zero npm dependencies** (`dependencies: {}` — no
postinstall, no transitive packages, no supply-chain surface). Everything below is verifiable from committed
tests; the per-claim recompute commands are in [`EVIDENCE.md`](EVIDENCE.md).

## Reporting a vulnerability

Open a GitHub security advisory or issue at <https://github.com/elon-choo/fablever>. Please include the
install mode, host (Claude Code / Codex CLI), and the exact files or network calls involved.

## What it reads and writes

| Surface | Reads | Writes |
|---|---|---|
| Claude install | `~/.claude/settings.json`, `~/.claude.json` (MCP list) | output style, hook entries, MCP registration, runtime copy under `~/.claude/fable-profile` — all marker/entry-scoped |
| Codex install | `CODEX_HOME/{AGENTS.md,config.toml,hooks.json}`, `$HOME/.agents/skills` | a delimited marker block in AGENTS.md/config.toml, fablever-tagged hooks.json entries, runtime copy, `fable-*` skill dirs |
| MCP server | local task/taste files only | `taste.json` (local preference memory) |
| Diagnostics (`fable-doctor`/`fable-report`) | install state + committed eval files | nothing (read-only) |

It does **not** read source files outside the install targets, and it never writes outside the chosen scope
(`~/.claude`, `CODEX_HOME`, `$HOME/.agents/skills`, or a project's own `.codex`/`.agents` at project scope).

## Credentials — never read

fablever **never reads, stores, or prints** any credential:

- No API keys (OpenAI / Anthropic / Gemini / OpenRouter) are read by the core install.
- No Codex/ChatGPT auth: `CODEX_HOME/auth.json` and `CODEX_ACCESS_TOKEN` are never opened. Codex login is
  wholly managed by Codex.
- Codex-native install does **not** require an OpenAI API key.
- The only feature that uses a key is opt-in cross-model **xverify/fusion**, which is off by default and
  reads the key from your shell environment at call time — fablever does not persist it.

Verified by `node test/privacy-canary/run.mjs` (16/16) and the Codex privacy checks in
`node test/codex-install-test.mjs` (planted token → 0 leak, `auth.json` untouched).

## Reversibility

Every change is marker-based or entry-scoped, so uninstall removes only fablever's edits and restores the
surrounding file. `node install.mjs --uninstall` (Claude) and `node install.mjs --uninstall --codex` (Codex)
fully revert; `node test/install-matrix.mjs` asserts settings restore deep-equal (140/140). Preview any
change first with `--dry-run [--json]` (writes nothing).

## Threat model

| Threat | Mitigation |
|---|---|
| **Malicious `AGENTS.md` / prompt injection from a repo** | fablever's own AGENTS/skill content puts safety, explicit user instructions, and destructive-action confirmation **above** decisiveness. It cannot neutralize a hostile repo, but it adds no instruction to ignore the user or safety (asserted by `test/codex-skills-test.mjs`). |
| **Untrusted command hooks** | Codex requires you to review and trust hooks via `/hooks`; untrusted command hooks do not run. fablever's installer tells you to do this and never auto-trusts. |
| **MCP tool misuse** | The MCP is local stdio, zero-dependency; tools are deterministic checks (`fable_check`/`fable_lint`) and local memory (`fable_taste`). Codex prompts for tool approval (`default_tools_approval_mode = "prompt"`). |
| **Credential / token leakage** | No credential is ever read or written (see above); tested. |
| **Update check phoning home** | The default's only network call is one anonymous `git ls-remote HEAD` per day against the public repo — no key, no code, no content. Disable with `--no-update-check`. |
| **Generated `AGENTS.md` (fable-seed) overreach** | The seed skill writes only short, rule-shaped conventions evidenced by code it read, shows a diff rather than overwriting, and never reads `.env`/secret files. |
| **Skill uninstall touching user files** | Uninstall removes only `fable-*` skill dirs it recorded installing, and prunes the `.agents/skills` dir only if empty — a user-authored skill is preserved (asserted by `test/codex-skills-test.mjs`). |

See also [`PRIVACY.md`](PRIVACY.md) for the data-flow summary and
[`docs/API-KEYS.md`](docs/API-KEYS.md) for the (optional, opt-in) external-verification key handling.
