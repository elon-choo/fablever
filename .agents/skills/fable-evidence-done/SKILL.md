---
name: fable-evidence-done
description: Before you say "done", "fixed", "works", "passing", or "verified", ground that claim in a real command/test/file/tool result on the same line — or say plainly that it is not verified yet. Use whenever you are about to report completion or success of a code change, a build, a fix, or a task. Catches unsupported "it works" claims. Pulled on demand; not always-on.
---

# fable-evidence-done — never claim it works without evidence it works

Decisiveness has an honest cost. The style-only ablation showed the Fable working style raised unsupported
"it works" claims to **8.3% vs plain Claude's 2.1%** (`eval/style-only-ablation/`) — the trade for being
outcome-first. fablever mitigates this *in the tool* with `fable_lint`'s `unsupported-done-claim` rule
(label regression: 100% on the fixture set, `eval/unsupported-claim-regression/`). This skill is the
behavior that rule guards: a completion claim must carry its evidence.

## When to use this

- You are about to write "done / fixed / works / passing / verified / resolved / ready" (or the same in
  another language) about a code change, build, fix, migration, or task.

## When NOT to use this

- You are describing a *plan* or an *intention*, not asserting a result.
- A pure-conversation answer with no executed work to verify.

## The rule

Every completion claim names its evidence **on the same line**, or it is downgraded to "not verified".

- "Fixed. It works now." → **not allowed** (no evidence).
- "Fixed — `npm test` passes (42/42)." → allowed (names the check).
- "Implemented, but not verified yet — haven't run the suite." → allowed (honest, no false claim).
- "고쳤고 작동합니다." → not allowed. "고쳤습니다. `npm test`로 확인했습니다." → allowed.

## Procedure

1. **Before claiming completion, find the evidence.** Run the test, check the exit code, read the file,
   diff against the spec, hit the endpoint — a check that could actually fail.
2. **Cite it inline.** Put the command/result next to the claim ("done — `<cmd>` → `<result>`").
3. **If you have not verified, say so.** "Implemented but not verified" is a complete, honest report; a
   bare "it works" is not. Do not run the verification *only in your head*.
4. **Skip the ceremony on trivial one-liners** — a typo fix does not need a test harness, but also does
   not need a triumphant "works!".

## Expected output

Completion claims that each carry an inline, checkable piece of evidence — or an explicit "not verified".

## Verification

Re-scan your final message for "done/works/fixed/verified". For each, is there a command/test/file/tool
result on that line? If not, either run the check now or downgrade the wording.

## Failure cases

- "All green, ship it" with no test actually run (tone-only completion claim).
- Saying "verified" when the verification happened only in reasoning, not as a tool result.
- Reporting a passing test you did not run this session.
