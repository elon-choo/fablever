# Fable Profile

Make **any** Claude model — Opus, Sonnet, Haiku — adopt **Claude Fable 5's working style** inside Claude
Code (and any MCP client): decisive, outcome-first, restrained, evidence-grounded, and disciplined about
stopping. Always-on, every project, on your machine — and installable by anyone.

> **What this is and isn't.** This is a **style transplant, not a capability transplant.** It recovers
> *how* Fable works — restraint over gold-plating, acting instead of over-asking, leading with the
> outcome, grounding claims in tool results, stopping when done. It **cannot** raise a weaker model's
> reasoning ceiling or long-horizon autonomy — those live in the weights. Everything here is built from
> Anthropic's own published Fable prompting guidance and applied through documented Claude Code
> mechanisms. See [`docs/RESEARCH.md`](docs/RESEARCH.md) for the full evaluation of 16 sources.

## The behavioral gap (baseline, measured on real logs)

A read-only scan of one machine's 100k+ assistant messages (`tools/fable-leaktest.js`):

| model | median words/msg | tool:text ratio | caveat % | "I'll/Let me" % |
|---|---|---|---|---|
| **fable** | 15 | 6.78 | 0.3 | 4.7 |
| opus | 32 | 1.47 | 0.9 | 13.8 |
| sonnet | 51 | 1.14 | 3.7 | 42.9 |

Fable is terser, acts more per unit of narration, hedges less, and self-narrates less. These are **surface
proxies** for working style, not a measure of correctness, and the table is a **baseline gap between
models — not a before/after of this profile**. The profile aims the other models at Fable's column; re-run
with `--since <install-date>` after installing to check whether your own numbers actually moved.

## Install (this machine, always-on)

```bash
git clone <this-repo> ~/work/fable-profile   # or wherever
cd ~/work/fable-profile
./install.sh                  # sets the Fable output style as default + registers the MCP server
# restart Claude Code (or /clear) so the output style and MCP load
```

Options:

| flag | effect |
|---|---|
| *(none)* | output style set as default (always-on) + MCP registered |
| `--with-hook` | also add the opt-in per-turn re-injection hook (see "Why opt-in") |
| `--no-style` | install the style file but don't set it default (pick "Fable" in `/config`) |
| `--no-mcp` | skip the MCP server |
| `--uninstall` | remove everything; restores prior settings |

The installer **backs up `settings.json`** before any edit and only ever touches `outputStyle` and its own
hook entry — every other hook, permission, and setting is left untouched. Verify it yourself:
`bash test/install-test.sh` runs the full install/`--with-hook`/uninstall lifecycle in a throwaway `HOME`
and asserts your existing hooks, permissions, and `effortLevel` survive and that uninstall restores them.

### Disable / remove

```bash
export FABLE_PROFILE=off       # turns off the hook for the current shell (if installed)
./install.sh --uninstall       # full removal
```

## What gets installed

- **Output style** `~/.claude/output-styles/Fable.md` — the always-on lever. Appends the governor to the
  system prompt at session start with `keep-coding-instructions: true`, so it **layers onto** Claude
  Code's coding behavior. Cache-amortized; no execution surface.
- **MCP server** `mcp/src/server.js` — **zero dependencies** (no `@modelcontextprotocol/sdk`, nothing to
  `npm install`). Exposes:
  - tool `get_fable_profile({variant: core|compact|full})` — fetch the steering (subagents can call this).
  - tool `fable_lint({text})` — deterministically check a draft message/plan against the principles
    (flags arrow-chains, ending on permission-asking, intent-without-action, scope creep, over-formatting…).
  - prompt `fable-mode` — inject the full profile on demand (`/mcp__fable-profile__fable-mode`).
  - resources `fable://profile/{full,compact,core}`.
- **Opt-in hook** `~/.claude/hooks/fable-reinject.sh` — re-injects a tiny *core* reminder each turn to
  fight long-session decay. Model-aware (skips Fable-class models), fail-safe (always exits 0).
- **Profiles** `profiles/{full,compact,core}.md` — the single source of truth, symlinked into `~/.claude`.

### Why the hook is opt-in

A `UserPromptSubmit` hook is the only way to re-inject steering *per turn*, but: it bills tokens on every
turn (never cache-amortized like a system prompt), it's per-machine, and **it does not fire for workflow
subagents** — so it'd be absent exactly where multi-step work happens. The output style already carries the
full governor at session start with [built-in adherence reminders](https://code.claude.com/docs/en/output-styles),
so the hook is a small **anti-decay
booster** for very long sessions, not the primary mechanism.

> **Subagents.** Neither the output style nor the hook reaches Task/workflow subagents (they run with
> their own system prompt). To put delegated subagents on the Fable style too, paste the snippet in
> [`claude-code/subagent-brief.md`](claude-code/subagent-brief.md) into the agent's brief, or have the
> subagent call the MCP `get_fable_profile` tool.

## Use it elsewhere (other people, other MCP clients)

Register the MCP server in any client (Cursor, Windsurf, Claude Desktop, another Claude Code user):

```bash
claude mcp add --transport stdio fable-profile --scope user -- node /abs/path/to/mcp/src/server.js
```

Or the JSON form in `~/.claude.json` / `.mcp.json`:

```json
{ "mcpServers": { "fable-profile": { "type": "stdio", "command": "node",
  "args": ["/abs/path/to/mcp/src/server.js"] } } }
```

Then `get_fable_profile` / the `fable-mode` prompt work anywhere MCP does. For always-on on *their*
machine, they run `./install.sh` too (the output style is the portable always-on surface). There is no
"force it on everyone without opt-in" path — by design: Claude Code's `force-for-plugin` frontmatter only
applies to plugin-bundled output styles and is ignored for a user style like ours.

## Verify

```bash
node test/mcp-test.js                  # 16 MCP protocol checks
bash test/install-test.sh              # install/uninstall safety lifecycle
node tools/fable-leaktest.js           # behavioral baseline from your own logs
node tools/fable-leaktest.js --since <install-date>   # did the profile move the needle?
```

## Supply-chain hygiene

Built from inspectable plain text only: an output-style markdown file, one small [audited](docs/RESEARCH.md#4-supply-chain-findings-every-reused-idea-was-static-analyzed) bash hook, and a
zero-dependency Node MCP. **No** `npx`/`pip`/`curl|sh`, no postinstall, no third-party package, no network
calls, no credential reads. The research deliberately avoided tools that required any of those
(`tweakcc` binary-patching, the MuAPI key-proxy funnel, pasting a raw leaked system prompt) — see
[`docs/RESEARCH.md`](docs/RESEARCH.md) §4.

## License

MIT.
