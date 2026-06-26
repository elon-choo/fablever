# fablever on Codex CLI (native)

fablever runs natively inside **OpenAI's Codex CLI**, not only Claude Code. Same honest positioning: a
**style/structure transplant, not a capability upgrade.** It cannot make a model smarter — it applies Fable's
working-style discipline (act decisively, lead with the outcome, don't over-build, ground completion claims
in evidence, stop when done) through Codex's own extension surfaces.

> **Codex has no Claude-Code output-style surface.** So the always-on layer is delivered through Codex's
> equivalents instead: **`AGENTS.md`** (instruction layer), **`hooks.json`** (lifecycle hooks), and
> **`config.toml`** (MCP servers). The MCP server is the *same* zero-dependency `mcp/src/server.js` Claude
> Code uses — just registered host-aware (`FABLE_HOST=codex`).

## Two install modes

| mode | command | what it writes | recommend |
|---|---|---|---|
| **style-only** | `node install.mjs --codex-style-only` | one marker block in `AGENTS.md` (instruction text only). No hooks, no MCP, no network. | **first install** — lowest surface, safest |
| **full** | `node install.mjs --codex-full` (alias `--codex`) | `AGENTS.md` block **+** `SessionStart`/`SubagentStart` hooks (`hooks.json`) **+** the `fable-profile` MCP (`config.toml`) **+** on-demand `fable-*` Agent Skills (`.agents/skills/`) | when you want hooks + MCP (`fable_check`, `fable_status`, `fable_taste`, subagent reach) + the skills |

```bash
# Safest first install for Codex (AGENTS.md only):
node install.mjs --codex-style-only

# Full local Codex install (AGENTS.md + hooks + MCP):
node install.mjs --codex-full

# See exactly what changes first — writes nothing:
node install.mjs --codex-full --dry-run          # add --json for machine-readable
node install.mjs --codex-style-only --dry-run

# Check the installed state:
node install.mjs --codex-status

# Remove ONLY the Codex install (Claude Code, if installed, is untouched):
node install.mjs --uninstall --codex            # alias: --codex-uninstall
```

After a **full** install, finish in Codex itself:

```
/hooks      # review and TRUST the new fablever hooks — untrusted command hooks do NOT run
/mcp        # confirm fable-profile is connected
```

Verify the AGENTS layer loaded (any mode):

```bash
codex --ask-for-approval never "Summarize the current instructions you loaded."
```

## What gets installed (full mode), and how it's reversible

Everything is **marker-based** and backed up before edit, so uninstall removes ONLY fablever's blocks:

- **`${CODEX_HOME:-~/.codex}/AGENTS.md`** — a block between `<!-- fablever:codex:start -->` and
  `<!-- fablever:codex:end -->`. Your existing AGENTS.md content is preserved; reinstall is idempotent;
  uninstall removes just the block. The pre-edit file is backed up to `AGENTS.md.fable-bak-<ts>`.
- **`${CODEX_HOME}/hooks/fable-session.js`, `fable-subagent.js`** (+ `fable-reinject.js` with
  `--codex-with-reinject`) — zero-dependency, fail-open Node hooks. Registered in `hooks.json` under
  `SessionStart` (matcher `startup|clear`) and `SubagentStart` (matcher `*`). fablever's entries carry a
  `fablever:` statusMessage prefix so uninstall removes only those; your own hooks stay.
- **`${CODEX_HOME}/config.toml`** — a `# fablever:codex:mcp:start` … `# fablever:codex:mcp:end` block
  registering `fable-profile` (`node …/runtime/mcp/src/server.js`) with host-aware env
  (`FABLE_HOST=codex`, `FABLE_PROFILE_HOME`, `FABLE_HOME`, `FABLE_TASTE_FILE`).
- **`${CODEX_HOME}/fable-profile/runtime/`** — an immutable copy of `mcp/ profiles/ orchestration/ docs/`
  the MCP and hooks resolve from any directory.
- **`$HOME/.agents/skills/fable-*/`** (user scope) or **`<project>/.agents/skills/fable-*/`** (project
  scope) — the on-demand Agent Skills (see below). Reversibility here is record-tracked rather than marker
  based: the installer records exactly which `fable-*` skill dirs it created, and uninstall removes only
  those, leaving any skill you authored in place.

`--no-codex-agents` / `--no-codex-hooks` / `--no-codex-mcp` / `--no-codex-skills` drop any one part.
`--dry-run` shows the exact files, hooks, MCP, skills, network behavior (none), credential behavior (none),
and uninstall command before writing.

## Codex Agent Skills (full mode)

`--codex-full` also installs five **on-demand** skills into Codex's skill-discovery directory
(`$HOME/.agents/skills` for a user install, `<project>/.agents/skills` for project scope). Unlike the
always-on `AGENTS.md` layer, a skill's `SKILL.md` loads only when its description matches the task, so it
costs no context until it is relevant:

- **`fable-scope-guard`** — hold the exact scope asked; no adjacent refactors or drive-by cleanup.
- **`fable-delivery-gate`** — acceptance check before handing over an external-facing deliverable.
- **`fable-evidence-done`** — never claim done/works/fixed without evidence on the same line.
- **`fable-review`** — adversarial review before lock-in; find and rate failure paths, don't rewrite.
- **`fable-seed`** — write the short local `AGENTS.md` a module's code already implies.

Skills need **no `/hooks` trust step** (they are model-pulled instructions, not command hooks), but they do
require a Codex build with Agent Skills support — confirm with `/skills` if your build has it. When you run
an install from *inside the fablever repo at project scope*, the source and destination `.agents/skills` are
the same directory, so the installer skips the copy and never touches the repo's own skills.


## `AGENTS.override.md`

Codex reads `${CODEX_HOME}/AGENTS.override.md` **first** at the global level if it exists — it overrides
`AGENTS.md`. So if you have an override file, patching `AGENTS.md` would be shadowed. fablever handles this:

- By default, if `AGENTS.override.md` exists, the install **warns and skips** the AGENTS step (it won't write
  a block you can't see).
- Run with **`--codex-patch-override`** to patch the override file instead (the marker block goes into
  `AGENTS.override.md`).

## Project scope

By default everything installs at **user scope** (`${CODEX_HOME:-~/.codex}`). Use
`--codex-scope=project` to install into the current repo instead:

```bash
node install.mjs --codex-full --codex-scope=project
```

This patches the project-root `AGENTS.md` and writes `.codex/config.toml`, `.codex/hooks.json`,
`.codex/hooks/`, and `.codex/fable-profile/` in the current directory. **Project-local `.codex` config only
loads in a trusted project** (Codex's own trust model), and project hooks still require `/hooks` trust.
fablever never silently installs project hooks — you ask for project scope explicitly.

## Auth — fablever never touches your Codex tokens

Codex signs in with your **ChatGPT/OAuth login** (or an OpenAI API key). **That auth is wholly managed by
Codex. fablever does not read, store, or print it** — not `auth.json`, not `CODEX_ACCESS_TOKEN`, no token
env value. The installer may run `codex --version` / `codex mcp --help` to detect the CLI, and that is all.

- If Codex is **not installed**, the installer prints a hint (e.g. `npm install -g @openai/codex`) but does
  **not** install global packages for you.
- If a model call says you are **signed out**, run `codex` or `codex login` (headless:
  `codex login --device-auth`). fablever does **not** run login for you.
- **Codex-native fablever needs no OpenAI API key.** API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`,
  `OPENROUTER_API_KEY`) are only for the optional Claude-side xverify/fusion paths — see
  [`API-KEYS.md`](API-KEYS.md).

## Two different "Codex" things — don't conflate them

1. **Codex as a GPT reviewer *inside Claude Code* xverify** — you run Claude Code, and the optional
   cross-model verify loop calls the `codex` MCP as a GPT second opinion. That is a *cross-model* reviewer
   path (a different lab checks Claude). Covered in [`API-KEYS.md`](API-KEYS.md) §"the codex MCP path".
2. **Codex CLI as the host where fablever itself runs** — *this* document. fablever applies its working style
   to your Codex sessions. **A Codex host verifying its own output is not cross-model verification** — there
   is no second lab in the loop. The Codex-native install therefore does **not** enable xverify; it reports
   `external_verification: off`.

## Status fields (`--codex-status`)

`node install.mjs --codex-status` reports: `CODEX_HOME`; whether the AGENTS marker is active and in which
file; whether `AGENTS.override.md` exists (with a warning if it shadows AGENTS.md); which hook events are
registered (and a reminder that trust can only be confirmed in `/hooks`); whether the MCP config block is
present; which `fable-*` skills are installed (and the skills dir); whether the `codex` binary is found;
auth status (**not inspected** — "run codex/codex login");
external verification (off); the uninstall command; and a dry-run pointer. Anything it cannot verify from the
filesystem it reports as **unknown**, never a confident false.
