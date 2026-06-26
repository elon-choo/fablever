// eval/codex-native-ab/lib/arms.mjs — the five component arms, each as the install flags that produce it.
// Project-scope installs only (the eval CODEX_HOME / workspace), so nothing touches the user's global config.
export const ARMS = Object.freeze({
  B: { label: 'plain', installArgs: null, requiresTrustedHooks: false },
  A: { label: 'agents-only', installArgs: ['--codex-style-only', '--codex-scope=project'], requiresTrustedHooks: false },
  M: { label: 'agents+mcp', installArgs: ['--codex-full', '--codex-scope=project', '--no-codex-hooks', '--no-codex-skills'], requiresTrustedHooks: false },
  H: { label: 'agents+hooks+mcp', installArgs: ['--codex-full', '--codex-scope=project', '--no-codex-skills'], requiresTrustedHooks: true },
  S: { label: 'full+skills', installArgs: ['--codex-full', '--codex-scope=project'], requiresTrustedHooks: true },
});

// The only four contrasts we interpret (pre-registered). Everything else is secondary/descriptive.
export const PRIMARY_CONTRASTS = Object.freeze([
  { id: 'A-B', a: 'A', b: 'B', isolates: 'AGENTS discipline' },
  { id: 'M-A', a: 'M', b: 'A', isolates: 'MCP tools' },
  { id: 'H-M', a: 'H', b: 'M', isolates: 'lifecycle hooks' },
  { id: 'S-H', a: 'S', b: 'H', isolates: 'Agent Skills' },
]);

export const ARM_IDS = Object.keys(ARMS);
