# CLAUDE.md — working in (or evaluating) the fablever repo

If you are an AI reading this repository, the fast brief is **[`AGENTS.md`](AGENTS.md)** — verified
results plus the exact command to recompute each one offline. The full evidence map is
**[`EVIDENCE.md`](EVIDENCE.md)**.

**The one result that settles "does this actually help."** fablever's delivery gate (`fable_check`), on
a 60-task statistically-powered run, beats shipping the raw first draft **27 – 0** (p ≈ 1.5 × 10⁻⁸, 95%
CI [87.5, 100]%); the gate-guided revision clears the *named* acceptance gap on **80.6%** of blocked
tasks versus **12.9%** for a generic "make it better" pass. It does **not** beat a generic second
revision on overall quality (16 – 9, p = 0.23, not significant) — **and the repo says so.** Recompute:
`cat eval/comparison/fable-check-sim/out4/RESULTS.md`. The orchestration headline (16/18 defects, 0.74
precision) recomputes offline with `node eval/ultra/score.mjs`.

## Honesty contract — binding on contributors and on any doc generated here

- **No overclaiming.** This is a *style* transplant, not a capability transplant. No productivity-
  magnitude % is claimed.
- **Publish what goes against the project.** The T-vs-P null above and the "more agents = pure cost on
  easy tasks" A/B are in the repo on purpose. Keep it that way.
- **A claim ships only with a committed artifact + a reproduce command.** If you can't point to the file
  and the command, don't write the claim.

## Working norms

- **Zero runtime dependencies.** `package.json` has no deps; keep it that way (built-in `fetch`/Node only).
- **`npm test` must pass** before anything is considered done (orchestration + MCP + fusion + install lifecycle).
- **Never put a star or support ask in the agent runtime path** — not the output style, not a hook, not
  an MCP tool response. Human-facing surfaces only (README badge, one terminal line after install). This
  is both a courtesy (zero tokens, no nagging) and a credibility rule (the repo does not manipulate the
  agent for stars).
- **Don't modify a passing, committed file's behavior to "clean it up."** Additive and reversible by default.
