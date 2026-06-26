# codex-native-ab

A **component-level** A/B that isolates which Codex surface (AGENTS / MCP / hooks / skills) actually moves
the needle, instead of only comparing plain-vs-full. Pre-registration, arms, primary contrasts, metrics, and
stopping rules are in **[`PROTOCOL.md`](PROTOCOL.md)** (frozen before any data is read). Honest frame
unchanged: fablever is a discipline layer, not a capability upgrade — a null/negative here is a result.

## Run

```bash
node run.mjs --dry-run [--json]        # the plan: tasks × arms, exact codex command — NO install, NO model call
node run.mjs --codex-home=<dir> [--arms=B,A,M,H,S] [--task=<id>] [--seed=1]
```

Execute needs a **dedicated eval `CODEX_HOME`** you logged into once by hand — the runner never reads or
copies auth, and passes a **token-free allowlist env** to the child (`lib/safe-env.mjs`). The codex binary is
`$FABLE_CODEX_BIN` or `codex`, so a fake shim can drive the whole harness offline (see
`test/codex-ab-runner-test.mjs`, which runs in CI with no network/auth).

## What is built (tested) vs. pending

**Built + tested (`node test/codex-ab-runner-test.mjs`, 22 checks):** the five arms (`lib/arms.mjs`), the
token-free child env (`lib/safe-env.mjs`), the defensive `codex exec --json` event parser
(`lib/codex-events.mjs`), the runner with a writes-nothing `--dry-run`, per-task workspace isolation +
production-file diff, and the deterministic path/exit scorers (scope violation, acceptance pass, unnecessary
change on no-change tasks). Task schema + smoke fixtures under `schemas/`, `fixtures/`, `prompts/`.

**Pending (next increments):** the **frozen oracle** for the unsupported-done-claim metric (`oracle/`,
`score.mjs`) so the code under test is never its own judge; the H/S **hook-trust probe**; the **blind quality
judge** (`judge.mjs`); the per-contrast stats roll-up reusing `measurement/lib/stats.mjs`; and the
**pilot → frozen confirmatory** task set (≥60). Until those land this is the harness, not a result.
