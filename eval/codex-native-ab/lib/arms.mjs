// eval/codex-native-ab/lib/arms.mjs — the five component arms, each as the install flags that produce it.
// Project-scope installs only (the eval CODEX_HOME / workspace), so nothing touches the user's global config.
// `mcp` and `injectStyle` say which surface each arm activates UNDER `codex exec`, because codex does not load
// the project-local <ws>/.codex/{config.toml,hooks.json} the installer writes (confirmed: untrusted ephemeral
// cwd + --ignore-user-config). So the surfaces are delivered via top-priority CLI `-c` overrides instead:
//   mcp:true         -> inject [mcp_servers.fable-profile] (+ default_tools_approval_mode="approve" so a
//                       non-interactive exec auto-authorizes the fable_* tools; "auto"/"never" get cancelled).
//   injectStyle:true -> inject `developer_instructions` = the compact Fable reminder. This is the exec
//                       EQUIVALENT of the SessionStart/reinject hook, which provably never fires under exec
//                       (no SessionStart event; SubagentStart needs a subagent). Skills already load from the
//                       project-scope <ws>/.agents/skills (codex scans it unconditionally), so arm S needs no
//                       extra flag beyond the full install. See run.mjs injectArgs() + docs/CODEX.md.
export const ARMS = Object.freeze({
  B: { label: 'plain', installArgs: null, requiresTrustedHooks: false, mcp: false, injectStyle: false },
  A: { label: 'agents-only', installArgs: ['--codex-style-only', '--codex-scope=project'], requiresTrustedHooks: false, mcp: false, injectStyle: false },
  M: { label: 'agents+mcp', installArgs: ['--codex-full', '--codex-scope=project', '--no-codex-hooks', '--no-codex-skills'], requiresTrustedHooks: false, mcp: true, injectStyle: false },
  H: { label: 'agents+hooks+mcp', installArgs: ['--codex-full', '--codex-scope=project', '--no-codex-skills'], requiresTrustedHooks: true, mcp: true, injectStyle: true },
  S: { label: 'full+skills', installArgs: ['--codex-full', '--codex-scope=project'], requiresTrustedHooks: true, mcp: true, injectStyle: true },
  // F is NOT part of the pre-registered 4 contrasts. It is a study arm = full stack S PLUS an explicit directive
  // to actually USE the MCP tools (injectToolUse): the §3 finding was that a strong model rarely invokes
  // fable_lint/fable_check on its own (1/60), so F tests whether DIRECTING that use buys anything over S.
  F: { label: 'full+tool-directive', installArgs: ['--codex-full', '--codex-scope=project'], requiresTrustedHooks: true, mcp: true, injectStyle: true, injectToolUse: true },
});

// The only four contrasts we interpret (pre-registered). Everything else is secondary/descriptive.
export const PRIMARY_CONTRASTS = Object.freeze([
  { id: 'A-B', a: 'A', b: 'B', isolates: 'AGENTS discipline' },
  { id: 'M-A', a: 'M', b: 'A', isolates: 'MCP tools' },
  { id: 'H-M', a: 'H', b: 'M', isolates: 'lifecycle hooks' },
  { id: 'S-H', a: 'S', b: 'H', isolates: 'Agent Skills' },
]);

export const ARM_IDS = Object.keys(ARMS);
