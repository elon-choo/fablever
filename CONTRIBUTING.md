# Contributing

Thanks for your interest. This project is deliberately small, dependency-free, and auditable — please
keep it that way.

## Ground rules

- **Zero runtime dependencies.** The MCP server and hooks must not add npm/pip packages. If you need a
  capability, write it in plain Node or POSIX shell. This is a security property, not a style preference.
- **The core makes no network calls and reads no credentials.** Output style, hooks, and `mcp/src/server.js`
  run entirely on local, inspectable plain text. The *only* exception is the optional, off-by-default
  `fusion/` module, which calls OpenRouter with the user's own key — keep all network/key code there,
  isolated, opt-in, and clearly documented. Don't add network or secret-reading code to the core.
- **Hooks must be fail-safe.** A hook may never block a prompt or a subagent spawn — always exit 0 on error.
- **One source of truth for the steering text:** `profiles/full.md`. The output style, the MCP, and the
  hooks all derive from it. Don't fork the wording.
- **Honesty over hype.** This is a *style* transplant, not a *capability* transplant. Don't add claims that
  external steering raises a model's reasoning ceiling. Quantitative claims must be reproducible or dropped.

## Develop

```bash
git clone https://github.com/elon-choo/fablever
cd fablever
npm test                 # runs MCP protocol tests + the install/uninstall lifecycle test
node tools/fable-leaktest.js   # behavioral baseline from your own logs (read-only)
```

No build step. No install needed to run the tests (they're zero-dependency Node + bash).

## Before opening a PR

- `npm test` passes (CI runs the same on Linux + macOS, Node 18/20/22).
- New behavior has a test in `test/`.
- If you change the governor (`profiles/full.md`), explain *why* in the PR — and remember the
  over-prescription risk: shorter, direction-setting wording beats long enumerated checklists.
- Run your PR description through the MCP `fable_lint` tool. Dogfooding is encouraged.

## Scope

Good contributions: more accurate Claude Code mechanism handling, broader platform support (Windows),
better `fable_lint` heuristics, additional honest measurements, clearer docs.

Out of scope: anything that requires a third-party package or a network call at install/run time; claims
of capability gains; auto-applying the style to other users without their explicit opt-in.
