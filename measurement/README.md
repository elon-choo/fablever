# measurement — the out-of-band holdout (the one eval a single-turn A/B can't do)

Every other eval in this repo is single-turn. The cost they structurally cannot see is whether the
**always-on hook/gate layer helps or hurts a *long real session*** by filling context with verification
noise — the **"harness paradox"** (a 0.0 lift is a break-even warning, not a pass). The upgrade research
([`../eval/technique-ab/RESEARCH-upgrade-points.md`](../eval/technique-ab/RESEARCH-upgrade-points.md))
flagged this as the **highest-leverage** missing measurement, and the task-routing A/B confirmed *why*: in a
single shot, always-on discipline is cheap (the model ignores what doesn't fit), so its real cost only shows
across many turns — exactly what this measures.

This is **our own implementation** of a longitudinal holdout. The idea (out-of-band logging + a hashed
holdout + post-hoc outcome signals) is standard experiment hygiene; we noticed a sibling project
(`fivetaku/fablize`) names the same paradox, but none of this code is ported from it.

## What it does

- **`holdout.js`** — a `SessionStart` hook. **Inert unless `FABLE_MEASURE=on`.** When on, it hashes
  `session_id` → arm (`on` ~80% / `off` ~20%), appends one out-of-band line to `measure-ledger.jsonl`, and
  for the `off` arm drops `~/.claude/fable-profile/holdout/<sid>.off`. It **never** writes to the model's
  context — the assignment must be invisible, or the control group starts behaving like the treatment.
- **The off arm runs untreated.** `fable-reinject.sh` and `fable-subagent.js` each carry a one-line guard
  (also inert unless `FABLE_MEASURE=on`) that skips injection when the session's `.off` marker is present.
- **`collect.mjs`** — *after* the sessions, harvests heuristic outcome signals from the committed
  transcripts (re-instructions, rework edits, failed tool results, tool calls, wall-time) and joins them to
  the arm. Run it whenever; it only reads.
- **`analyze.mjs`** — compares `on` vs `off` on the load-bearing "lower-is-better" signals and prints a
  directional verdict, with a **park-until-proven** floor (refuses to conclude below 15 sessions/arm).

## Consent — read before enabling

The `off` arm runs roughly **1 in 5 of your sessions WITHOUT fablever**. That degradation *is* the
measurement — you cannot compare on vs off without an off arm. So this is opt-in: you turn it on for a
campaign, let it accrue, read the analysis, then turn it off. Don't leave it on by default.

## Run a campaign

1. Register the holdout hook with the installer (reversible, marker-based — preferred):
   ```bash
   node install.mjs --with-measure-holdout          # installs + registers the SessionStart holdout hook
   node install.mjs --with-measure-holdout --dry-run # preview first; writes nothing
   # remove later: node install.mjs --no-measure-holdout
   ```
   <details><summary>Manual fallback (if you are not using the installer)</summary>

   ```bash
   cp measurement/holdout.js ~/.claude/hooks/fable-holdout.js
   # settings.json → hooks.SessionStart → add: { "hooks": [ { "type": "command",
   #   "command": "node $HOME/.claude/hooks/fable-holdout.js" } ] }
   ```
   </details>
2. Turn it on for your shell sessions:
   ```bash
   export FABLE_MEASURE=on        # in ~/.zshrc for a sustained campaign
   ```
3. Work normally for a few weeks (aim ≥15 sessions per arm).
4. Read it out:
   ```bash
   npm run measure:collect        # node measurement/collect.mjs
   npm run measure:analyze        # node measurement/analyze.mjs
   ```
5. Stop the campaign: `unset FABLE_MEASURE` (and remove the SessionStart entry). The guards go inert; the
   ledger stays for analysis.

## Codex CLI campaign (host-neutral core)

The Codex path uses the same idea with a race-free, privacy-hardened core (Codex fires same-event hooks
concurrently, so each injector derives the arm from the SAME `HMAC(salt, campaign\0session)` as the logger —
no shared marker). The ledger is **metadata only**: session/project are HMAC ids, never a raw id/cwd/prompt;
text-derived flags appear only with `--text-signals` and even then as booleans.

```bash
node install.mjs --codex-full                                  # 1) install (provides the runtime logger)
node measurement/codex-campaign.mjs start --campaign=c1 --allocation=50:50   # 2) seed salt + register logger
#    → trust the logger in Codex with /hooks, then export the printed FABLE_MEASURE* vars
node measurement/codex-campaign.mjs status                     # 3) per-arm counts + park-until-proven floor
node measurement/codex-campaign.mjs analyze                    # 4) bootstrap CI + permutation p + Cliff's δ (Holm)
node measurement/codex-campaign.mjs stop                       # 5) remove the logger; keep the data
```

`analyze` reports primary **lower-is-better** outcomes (e.g. failed tool results; re-instructions only with
text-signals) as `on − off` with a 95% bootstrap CI, a Holm-corrected permutation p, and Cliff's delta — and
refuses any verdict below 15 qualified sessions per arm (a qualified session has ≥2 user turns or ≥2 tool
calls). A CI that includes 0 is a **break-even** warning for an always-on layer, not a pass. Like the Claude
path, the Codex holdout measures the **injection layer**, not the base `AGENTS.md` (which stays in both arms).

## Honest limits

- **It measures the hook/gate layer, not the base output style.** The always-on output style is loaded at
  session start and can't be toggled per-session by a hook, so the `off` arm still has the base style; what
  this isolates is the marginal effect of the **per-turn reinject + subagent injection** — which is exactly
  the compounding context cost the harness paradox is about. The base-style effect needs a different design
  (two machines / two profiles).
- **The outcome signals are heuristic** (regex re-instruction detection, same-file rework counts), not a
  graded productivity score. They are deliberately plural so no single one drives a conclusion; treat the
  verdict as directional.
- **No keys, no network, no model calls.** Reads only the local ledger and your own transcripts.

### Known limitations (surfaced by an adversarial review)

- **Percentile bootstrap CI is mildly anti-conservative at the 15/arm floor** (~7% false exclusion of 0 vs
  5% nominal). `analyze` prints this caveat; lean on the Holm-corrected p and a clearly-signed CI, and prefer
  more sessions over reading right at the floor.
- **`FABLE_MEASURE_OFF_PCT` defaults to 50** if unset — `start` prints the export, but if you skip it both the
  guard and the logger silently use 50/50. Set it from the `start` output for any other allocation.
- **The guard and logger agree only while the campaign salt is stable.** `start` seeds the salt once and the
  logger only ever READS it (never creates one), so a normally-started campaign is consistent from session 1;
  deleting/regenerating the salt mid-campaign would flip ~half of subsequent sessions' arms. Don't.
- **Codex has no stable `SessionEnd` event**, so session duration is approximated from the first/last observed
  event, and tool counts are "observed via hook-covered events" — some execution paths may not be captured.
