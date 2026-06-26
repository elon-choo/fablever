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

**Built + tested:**
- the runner (`node test/codex-ab-runner-test.mjs`, 22 checks): five arms (`lib/arms.mjs`), token-free child
  env (`lib/safe-env.mjs`), defensive `codex exec --json` event parser (`lib/codex-events.mjs`), a
  writes-nothing `--dry-run`, per-task workspace isolation + production-file diff, and the deterministic
  path/exit scorers (scope violation, acceptance pass, unnecessary change). Task schema + smoke fixtures with
  **behavioral** `test.js` verification under `schemas/`, `fixtures/`, `prompts/`.
- the scorer + frozen oracle (`node test/codex-ab-score-test.mjs`, 15 checks): `oracle/fable-lint-frozen.cjs`
  (a version-pinned copy of the live unsupported-done-claim rule, byte-checked against it, so the code under
  test is never its own judge — see `oracle/VERSION.json`) and `score.mjs`, which assembles the per-(task,arm)
  outcome matrix and reports the four pre-registered contrasts with an exact paired **McNemar** test,
  **Holm** correction, a sign-aware verdict, and park-until-proven below the pilot floor.

- the H/S **hook-trust probe** (part of `node test/codex-ab-runner-test.mjs`): the Codex injector hooks write
  a zero-content trace line when they fire, so each H/S run records whether Codex actually ran (trusted) the
  hooks. `--require-hook-trust` DROPS a run whose hooks were inert rather than scoring an arm that silently
  collapsed to M. The trace carries no prompt / path / session id (asserted).

**Pending (next increments):** the **blind quality judge** (`judge.mjs`, a different-lab second opinion with
order-swapped blind judging; reads adapter commands, never a key); and the **pilot → frozen confirmatory**
task set (≥60 across the 6 domains, frozen after the pilot). Until those land this is the harness + scorer +
trust gate, not a result.
