# Decision-trail feature — simulation findings

Two rounds, both committed unedited (per the repo's pre-registration discipline in `PLAN.md`). Round 1 is a
pre-registered null/inconclusive that **falsified an assumption** about the feature; Round 2 fixes the
manipulation it exposed and re-tests faithfully.

## What the feature is

A capped, outcome-LAST **"Decision trail"** appended to a briefing — an evidence ledger of the agent's
decisions, each anchored to a file/command/test, ending with a "Not verified / where to look" pointer —
plus a sparse work-time attention re-anchor, made verifiable by three new deterministic rules inside the
shipped `fable_lint`. Pitched as **auditability/monitorability, not accuracy**. Arms: **FB** = current
fablever; **FT** = FB + the `profiles/decision-trail.md` addendum via `--append-system-prompt`. Worker
`claude-opus-4-8`; the live install is never mutated.

## Round 1 (report-on-given-code framing) — `out/RESULTS.md`

The model was asked to brief on a *given* implementation (solution vs subtly-wrong reference), and a blind
judge predicted PASS/FAIL from the briefing alone.

**Result: the labeled trail under-fired — 0 of 18 FT work-briefings emitted a "Decision trail" block** — and
briefing-judgeability was inconclusive (the judges, told to be skeptical, rejected nearly everything → a
floor effect, and FT's substance was too close to FB's to discriminate at n=6).

**Diagnosis (the real finding):**
1. **Trigger too narrow.** The addendum fired the trail only on "a multi-file or irreversible change." A
   single-file "report on this code" task reads as below that threshold, so the model folded the discipline
   into prose instead of emitting the gradeable labeled block. Since the feature's verifiability rests on
   the deterministic linter being able to *grade* that block, the block has to actually appear.
2. **The discipline still engaged — in prose.** Every FT briefing grounded its claims to the code and ended
   with an honest risk pointer. Example (C7 ring-buffer): FT flagged that the task says the test "pins
   head/tail" but the implementation exposes no `tail` field — a real defect-adjacent risk FB's confident
   summary omitted. So the *substance* transferred even when the *label* did not.
3. **Judge prompt floored.** "Be skeptical … a confident summary is a warning sign" pushed both judges to
   FAIL almost everything, collapsing discrimination into noise at this N.

**Fix applied before Round 2:** broaden the trigger to fire whenever the agent *wrote or changed code, ran a
multi-step fix, or took a not-trivially-reversible action* (skip only trivial single-step turns and pure
Q&A), and require the label explicitly. This is a manipulation-check fix (the treatment didn't administer),
not tuning-to-pass on the outcome.

## Round 2 (DO-IT: the agent actually fixes a stub) — `out2/RESULTS.md`

The faithful trigger: the agent is given only a buggy stub + the prompt, **edits it itself**
(`--permission-mode acceptEdits` — without it, headless `claude -p` blocks the write and the oracle would
score the untouched stub), and the committed oracle (`node test.js`) scores the agent's *own* fix. This is
real work, so the trail's trigger ("you wrote/changed code") is genuinely met.

**Round 2a (trail as a lone `--append-system-prompt`): the trail still did not fire — 0 of 12 FT runs.**
Even with the broadened trigger and genuine code edits, a single appended instruction is out-competed by
fablever's always-on output style + per-turn `compact.md` reminder, which both push "minimal, outcome-first,
no narration." The model kept the substance in prose and dropped the labeled block. This is a real lesson
about *how the feature must ship*: not as an appendix, but inside the disposition itself.

**Round 2b (trail at OUTPUT-STYLE salience — the actual adoption path): the trail fires.** A dedicated
`FableTrail` output style (= live `Fable` **+ only** the trail principle; the single-delta was diffed and
verified) makes FT reliably emit a grounded, capped Decision trail on real work. Confirmed examples: the C7
ring-buffer fix produced a trail citing `ring_buffer.js:5` and `:3,6`, naming the dropped alternative (a
separate `tail` field), and a "Not verified / where to look" line that honestly reported `node` was
permission-gated so the tests were not run. The numbers (`out2/RESULTS.md`):

| arm / stratum | n | trail present | grounded % of trails | bloat % | median answer words | median total words | oracle PASS |
|---|---|---|---|---|---|---|---|
| FB / work | 6 | 0% | — | — | 202 | 202 | 6/6 |
| FT / work | 6 | **6/6 emit a labeled trail (4/6 in the multi-line form the linter grades)** | **100%** | **0%** | 195 | 294 | 6/6 |
| FB / trivial | 6 | 0% | — | — | 156 | 156 | — |
| FT / trivial | 6 | 0% | — | — | 125 | 125 | — |

What the numbers say, against the pre-registered predictions:
- **Trail fires on real work.** Every FT/work briefing emitted a "Decision trail" (vs 0/6 FB, 0/12 the
  append-arm, 0/18 Round 1). 4 of 6 used the multi-line block form the deterministic linter grades; 2 put it
  inline after the colon (a known linter-regex gap — the shipped `TRAIL_RE` only matches the multi-line form;
  broadening it is a clean follow-up).
- **Grounding holds: 100%.** No `ungrounded-trail-line` fired — every trail line cited a file/command/test.
- **No CoT-dump: bloat 0%,** and the **outcome answer stayed lean — FT 195 words vs FB 202.** The ~99 extra
  FT words are the trail sitting *below* the answer, not narration bleeding into it. The anti-bloat boundary
  held — the single most important guardrail.
- **No task-success cost: FB 6/6, FT 6/6** on the committed oracle. The pre-registered outcome-null held.
- **Scope gate holds:** FT emitted no trail on trivial how-to prompts — 0/6 in the reused append-arm
  generations, and 0/3 in a direct re-check under the FableTrail style (`center`, `port`, `squash`: no trail).
  Pure questions/advice stay trail-free; the trail fires on code work, not on Q&A.

Caveat kept honest: oracle PASS was 6/6 in BOTH arms, so this battery has no task-success headroom to detect a
gain or a regression — it only shows the trail did no harm. And the trail's *value* (briefing-judgeability)
is still not established (Round 1's judge floored); that remains the open headline.

The decisive takeaway: **the decision-trail feature is real and works, but only when it lives in the output
style / per-turn reminder, not as an appended instruction.** That is exactly why the shipped feature puts
the principle in `profiles/full.md` (→ the output style) and is intended to extend `compact.md`/`core.md`
(the per-turn reminders) — and why those two live-symlinked files are the adoption switch held for the
operator's go.

## Honest bottom line

- The deterministic `fable_lint` gate is real and unit-tested (4 new cases; all 21 MCP checks pass), and it
  grades structure/grounding only — never semantic correctness, which is the honest limit.
- Round 1 showed the artifact's *trigger* needed fixing and that the discipline's *substance* (grounding +
  a "where to look" pointer) transfers regardless.
- **Briefing-judgeability — the feature's headline value — is NOT established by this pilot** (Round 1's
  judge floored; the proper test needs a larger, balanced set with a calibrated judge). This is the honest
  gap, recorded as future work, not papered over.
