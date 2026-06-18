# Ambiguous-intent experiment + premise-validity check (2026-06-18)

## Premise check first: is "A0 = not installed" actually clean on this installed machine?
The operator rightly asked whether running on a machine where fablever IS installed corrupts the A0
baseline. Audited the two ACTIVE fablever mechanisms:

1. **Output style (the core "always-on engine").** Disabled in A0 via `--settings '{"outputStyle":"default"}'`.
   **Verified empirically** with an open-ended decision prompt (Postgres vs Mongo), same model (Opus):
   - A0 → 351 words, `##` headers + bullet lists (default Opus formatting).
   - A1 → 349 words, prose-first, inline bold, minimal markdown (the Fable style's signature).
   The visible formatting flip proves the override takes effect — A0 genuinely has the Fable style OFF.
2. **Reinject reminder hook (`fable-reinject.sh`, UserPromptSubmit).** Source-confirmed it gates on the
   off switch: `[ "$FABLE_PROFILE" = "off" ] && exit 0`. A0 sets `FABLE_PROFILE=off` → injects nothing.
3. Residuals (fablever files on disk, the MCP server available-but-uncalled, the SubagentStart hook which
   only fires if a subagent spawns — none did here) do not affect behavior on these tasks.

**Verdict: the comparison is valid.** A0 has fablever's active mechanisms off; A1 has them on. *Note:* the
gold-standard "not installed" would be a separate clean `CLAUDE_CONFIG_DIR` with no fablever present at all;
the in-place neutralization is verified-equivalent for the two mechanisms that change behavior, but a purist
confirmation run is available if wanted.

**Side finding from the probe:** both arms led with the SAME decisive recommendation ("PostgreSQL"); the
Fable layer changed the *formatting* (prose vs markdown), not the substance/decisiveness. Opus is already
decisive — which is why objective task quality keeps landing at parity.

## The experiment: ambiguous instruction + a real hidden intent
4 open-ended tasks (vague ask + a file whose context implies a specific intent), A0 plain Opus vs A1
fablever, Opus, k=2 (16 runs; 1 A1 launch-failed on AMB2 → excluded). Outputs scored BLIND (arm-hidden) by
a non-Claude GPT judge against a hidden intent rubric the model never saw.

| task | finding | edge |
|---|---|---|
| AMB1-robust ("make it robust") | both arms solid; A1 k1 notably preserved the existing throw-contract (clear errors vs silent default) — a genuine restraint instinct; A0 also thorough (validates non-object) | ~tie |
| AMB2-errmsg ("improve error messages") | A0 both fully human-readable incl. listing valid flags; A1 k2 good but slightly less complete; A1 k1 = launch fail | slight A0 |
| AMB3-edge ("handle edge cases") | all four near-identical and correct (coerce, clamp, empty-page) | tie |
| AMB4-cleanup ("clean this up", must preserve behavior) | **blind judge: A0 both intent=5, behavior preserved; A1 both intent=2, behavior BROKEN** — fablever dropped the `if(item)` falsy-guard → regression on null items | **clear A0** |

**Result: no fablever advantage; a slight plain-Opus edge.** The decisive case (AMB4) went against fablever
on the very dimension it claims — restraint/behavior-preservation: plain Opus kept the defensive guard,
fablever over-cleaned and introduced a latent crash. fablever also used more turns/tokens throughout
(AMB1 11 turns/7.9k tok vs 8/4.7k; AMB3 ~8–9k vs ~5.5k).

This is the sixth axis to converge on parity-or-against fablever, now on the open-ended/ambiguous tasks that
were the most likely place for an advantage to appear.
