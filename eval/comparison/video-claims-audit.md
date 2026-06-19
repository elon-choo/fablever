# Video claims vs measured evidence — keep / cut audit (2026-06-19)

Audited the YouTube video's transcript (the creator's own promo) against the measured data in this repo, so
nothing in it becomes a falsifiable lie. Verdicts: **KEEP** (data supports it), **REFRAME** (true only with a
qualifier), **CUT** (measured data contradicts it for fablever-on-Opus).

## KEEP — defensible, with data
- **"Fable wasn't better than Opus in every respect."** ✓ TRUE and a credibility asset. Task success is at
  parity across 7 task classes (`can-we-beat-plain-opus.md`). The video saying this *out loud* is exactly
  what makes the rest believable.
- **"What Fable did better was the WAY of working — decisive, honest, verify before declaring done."** ✓
  Supported: on action-oriented questions a blind non-Claude judge (asker's view) preferred fablever's
  delivery **11/12 (~92%)** — "command first," "decisive," "no padding," "no invented assumptions"
  (`runs/2026-06-18/human-value/RESULTS.md`).
- **"You can't transplant the brain, but you can transplant the working attitude."** ✓ This is precisely the
  measured truth — style transfers, capability doesn't.
- **"Zero dependencies, ~250 lines, you can read it yourself."** ✓ Dependencies verified empty
  (`package.json` deps = `{}`). (Line count not re-counted here but the 0-deps + auditability point is solid.)
- **"18 planted bugs caught, scored by 5 rival AI models — not itself."** ✓ but LABEL it: the **18/18 is the
  prior-model peak**; on the latest models it is **16/18** at precision 0.74, under a **5-judge panel (4 GPT
  + 1 Gemini)** (`EVIDENCE.md`, `eval/ultra/`). Say "최대 18/18 (구버전 모델), 최신 16/18, 5개 모델 패널
  채점" — then it's bulletproof.

## REFRAME — true only as the Fable MODEL's property, or as the optional verify arm
- **"Claude Code stops lying / 'done' becomes really done."** As a *differential fablever-vs-Opus* claim this
  is NOT supported — plain Opus already self-verifies and task success is at parity (both equally "honest").
  Honest reframe: fablever's always-on disposition *encourages* verify-before-done, and the **optional
  cross-model verification arm** is what actually catches planted defects (the 18/16). Don't imply the
  *style* makes Opus measurably more truthful than baseline Opus — that part isn't measurable in its favor.

## CUT — measured data contradicts this for fablever-on-Opus
- **"말은 절반 이하로 줄고 도구로 직접 하는 비율은 몇 배가 됩니다" (words drop to <half, tool-use multiplies).**
  ✗ FALSE for the transplant. Measured on identical agentic coding tasks, same Opus, Fable off vs on:
  - words: A1 (Fable on) = **103–129% of A0** — the *same or MORE*, never <half.
  - tool:text ratio: **0.97–1.17×** — essentially unchanged, not "몇 배."
  These numbers describe the **native Fable 5 model** at full strength, not the style ported onto Opus. If
  the video presents them as what fablever does to *your* Claude Code, it is falsifiable in five minutes with
  this repo's own transcripts. Either drop the line or explicitly attribute it to the Fable *model*.

## The honest, strong claim to lead with instead
fablever does not change WHAT Opus produces (same correctness — proven) or how many tokens it spends (it does
not halve them). What it reliably changes is **how the answer is delivered to a human**, and that is
genuinely preferred for getting work done: *answer-first, decisive, no padding, no invented detail* — a blind
rival-model judge taking the asker's view picked it **11 of 12 times on "just tell me what to do" questions**,
at zero cost to correctness. That is real, measured, and not a lie. Build the video on that, plus the honest
18/16 cross-model defect-catch, plus 0-deps auditability.
