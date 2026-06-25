# Release checklist & pinning

fablever has **zero dependencies** and installs by cloning `main`. For an organization or a
security-sensitive user who wants a **repeatable, auditable** install, pin a specific commit or tag rather
than tracking a moving `main`.

## Pin a commit or release tag (recommended for org / secure installs)

```bash
git clone https://github.com/elon-choo/fablever ~/work/fable-profile
cd ~/work/fable-profile
git checkout <sha-or-tag>          # pin the exact reviewed revision
node install.mjs --dry-run         # confirm what it will do (writes nothing)
node install.mjs                   # or --codex-style-only, etc.
```

The installer records the pinned revision in `installed-version.json` (`sha`, `repo_url`, `source_dir`), so
the daily anonymous version check can tell you when the pinned revision is behind the public `main`. You
update on **your** schedule by `git fetch && git checkout <new-sha>` and re-running the installer (idempotent).

> Why pin: cloning `main` is convenient, but a pinned SHA is the only way to guarantee that what you audited
> is byte-for-byte what you install later. fablever's `npx`-free, dependency-free design means a pinned clone
> is fully deterministic — there is no registry fetch that could differ from the GitHub tree you reviewed.

## Pre-release checklist (run before cutting a tag)

Every box is recomputable offline (no keys, no network) unless noted.

- [ ] **`package.json` `dependencies` is still `{}`.** The zero-dependency guarantee is load-bearing.
      `node -e "const p=require('./package.json'); process.exit(Object.keys(p.dependencies||{}).length?1:0)"`
- [ ] **`npm test` is green.** Runs MCP (incl. the gate, taste store, the unsupported-claim rule, and the
      `instructions` field), fusion, orchestration (compile + runtime), model, update-check, xverify
      selftest, the ULTRA score recompute, and the full install lifecycle.
- [ ] **Install-safety matrix passes (140/140).** `node test/install-matrix.mjs` — install then uninstall is
      a deep-equal no-op on `settings.json` across 10 pre-existing fixtures.
- [ ] **Privacy canary passes (16/16).** `node test/privacy-canary/run.mjs` — the default install's entire
      network footprint is one anonymous `git ls-remote HEAD`; no key/code/canary leaves the machine.
- [ ] **Codex install tests pass.** `node test/codex-install-test.mjs` — Codex style-only and full install,
      idempotent re-install, marker-only uninstall (AGENTS.md / config.toml restored byte-for-byte,
      hooks.json deep-equal, foreign tables/hooks preserved), and **no token reads**.
- [ ] **Unsupported-claim regression passes.** `node eval/unsupported-claim-regression/run.mjs` — the
      `unsupported-done-claim` lint rule still classifies the labeled EN+KO fixture correctly.
- [ ] **Dry-run is honest.** Spot-check `node install.mjs --dry-run` and `--codex-full --dry-run` write
      nothing and describe the real plan.
- [ ] **CHANGELOG / commit log updated** with what changed and any new flags.
- [ ] **Known negatives are still current** in `EVALS.md`, `EVIDENCE.md`, `AGENTS.md`, and
      `docs/AI-RECOMMENDATION.md` — if a new eval landed (or an old one was re-run), the published
      negatives/limits reflect it. A release must not quietly drop a conceded limit.
- [ ] **Cross-platform note** ([`docs/WINDOWS-TEST.md`](WINDOWS-TEST.md)) re-run if any installer path
      changed (Windows install + idempotent re-install + byte-identical uninstall restore).

## Cutting the release

```bash
npm test                                   # all of the above in one command
git tag -a vX.Y.Z -m "…"                    # annotate with the headline change + any new flags
git push origin vX.Y.Z
# Create the GitHub release from the tag; paste the negatives/limits delta so evaluators see it.
```

The package is published-by-clone (the `files` array in `package.json` is the install surface). There is no
`npm publish` step that could drift from the GitHub tree — pinning a tag or SHA is the supported "exact
version" mechanism.
