// eval/codex-native-ab/lib/safe-env.mjs — the environment handed to a `codex exec` child.
//
// Load-bearing: we NEVER forward an API key, a Codex/ChatGPT auth token, or any secret-looking variable to the
// child. The child authenticates from the eval CODEX_HOME the user logged into by hand — the runner does not
// touch that. We build the child env from a small ALLOWLIST plus the CODEX_HOME we point at, and assert no
// secret slipped through. Zero dependencies.

// Names we pass through (everything else is dropped). Deliberately tiny.
const ALLOW = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ', 'SHELL', 'SystemRoot', 'COMSPEC', 'PATHEXT'];

// Anything matching these is treated as a secret and must never reach the child (defense-in-depth assertion
// on the `extra` arg; the allowlist above already drops everything else). Kept broad on purpose — `extra` is
// fablever-controlled, so an over-match only drops a var, never leaks one.
const SECRET_RE = /(API_?KEY|ACCESS_?TOKEN|_TOKEN|\bTOKEN\b|SECRET|PASSWORD|PASSWD|AUTH|CREDENTIAL|PRIVATE_?KEY|SIGNING_?KEY|SESSION_?KEY|DATABASE_URL|\bDSN\b|COOKIE|_PAT\b|BEARER|OPENAI|ANTHROPIC|GEMINI|GOOGLE|OPENROUTER|CHATGPT|GITHUB|GITLAB|AWS|GCP|AZURE)/i;

export function safeCodexEnv(codexHome, extra = {}) {
  const src = process.env;
  const out = {};
  for (const k of ALLOW) if (src[k] != null) out[k] = src[k];
  out.CODEX_HOME = codexHome;
  // Eval marker so fablever hooks/MCP know they run under measurement; never a secret.
  out.FABLE_HOST = 'codex';
  out.FABLE_EVAL = 'on';
  for (const [k, v] of Object.entries(extra)) out[k] = v;
  // Defense-in-depth: drop (and report) anything secret-looking that an `extra` or allowlist edit let in.
  const leaked = Object.keys(out).filter(k => SECRET_RE.test(k));
  for (const k of leaked) delete out[k];
  return { env: out, leaked };
}

export { SECRET_RE };
