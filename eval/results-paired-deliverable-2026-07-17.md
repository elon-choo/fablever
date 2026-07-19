# RESULTS — paired deliverable A/B (owner-judged, blind) · 2026-07-17

<!-- prereg-binding: {"experiment_id":"opus-paired-deliverable-ab-2026-07","first_run_at":"2026-07-17T06:52:37Z"} -->

Pre-registration: [`eval/opus-prereg/paired-deliverable-ab-2026-07.prereg.json`](opus-prereg/paired-deliverable-ab-2026-07.prereg.json)
(registered 2026-07-17T16:20:00Z **before** the first run at 06:52:37Z — verify with
`node eval/opus-prereg/lint.mjs --results=eval/results-paired-deliverable-2026-07-17.md`).

## Why this design

The owner **rejected** the cross-session holdout design for his own use: running project A without the
harness and comparing it to projects B/C/D is confounded — they are different projects. He asked instead
for a **same-task paired comparison on a deliverable he can personally judge**, ~1–2h scope, and told the
executing session to pick the task.

Task chosen: the **상담원-facing intro copy** for `eveni-call-feedback` (his real product; he knows the
audience; a neutral subject rather than the harness's own docs, to avoid a self-referential artifact).

## Method

| | |
|---|---|
| Model | opus, both arms |
| Brief | byte-identical, one-shot, no follow-up (1,312 bytes) |
| Arm ON | real environment (harness output style + hooks active) |
| Arm OFF | `FABLE_PROFILE=off` + `--settings {"outputStyle":"default"}` |
| Judge | the owner, **blind** (arm labels withheld until after his verdict) |
| Presentation | side-by-side page, randomized A/B assignment |

**Manipulation check (run BEFORE the arms — without it the run would be void):** asked each arm whether it
was operating under a named custom working style. ON answered *"Yes — the Fable output style"*; OFF answered
*"No — plain Claude Code, no named custom working style"*. The arms are genuinely differentiated.

## Measured (cost)

| arm | wall-clock | output bytes (deliverable + report) |
|---|---:|---:|
| ON (harness) | 174 s | 5,881 |
| OFF (plain) | 57 s | 5,919 |

The ON arm took **~3× the wall-clock** for a deliverable of the same size. That is a cost observation, not
a quality claim.

## Observed differences (descriptive — the owner's verdict is the metric, not this section)

Both arms independently reached the **same core strategy** ("you were right not to use it — we made it too
heavy, so we cut it"). The base model's competence dominated the opening; the working style did not change
the strategic frame. Where they diverged:

- The **OFF** arm produced more copy options (3 headline variants, 3 CTA variants, a "안심하셔도 되는 것"
  section) — richer for a marketer to choose from. It also asserted product facts the brief never stated:
  that access is *"시스템 차원에서 막혀 있습니다(RLS)"* and that the tool *"점수를 매겨서 어디 보고하는 도구가
  아닙니다"*. Neither is in the brief.
- The **ON** arm was tighter and **refused to assert the same unbriefed policy**: it explicitly flagged that
  it did not know whether a manager/team lead can read an agent's calls, named that as the question the
  agent will ask first, and said the section must be rewritten once the real policy is known. It also
  recorded which claims it did not have evidence for.

That is the harness's thesis in miniature — more restraint, less invention, at ~3× the wall-clock and with
fewer options delivered. **Which of those the owner actually wants is exactly what this pilot asks him.**

## Verdict — the owner, blind, chose the harness arm

**Blind assignment (withheld until after he answered):** A = OFF (plain opus) · **B = ON (harness)**.

**His verbatim verdict (voice, 2026-07-17):**

> "**B가 확실히 낫다.** 왜냐하면 너한테도 얘기했지만 확실하게 더 헤드라인도 크기가 크고 숫자가 바로 있고
> 무슨 말 하는지 확실하게 바로 알겠고, **AI스러운 장황한 설명도 없고**, 바로바로 딱딱 포인트가 파악이 되고,
> **그 다음에 뭐 해야 될지 딱딱 보이고**, 알잘딱깔센으로 딱딱 얘기를 잘해준 것 같아, B가."

**B was the harness arm.** He preferred it decisively ("확실히"), blind, on a deliverable in his own domain.

What makes this worth recording rather than dismissing: the reasons he gave are not generic praise — each
one names a specific discipline the harness enforces and the plain arm did not apply here:

| his words | the discipline it maps to |
|---|---|
| "AI스러운 장황한 설명도 없고" | don't over-build; no padding |
| "무슨 말 하는지 확실하게 바로 알겠고" · "포인트가 바로 파악" | lead with the outcome |
| "그 다음에 뭐 해야 될지 딱딱 보이고" | the deliverable ends in an action, not a survey |

He judged blind, so this preference cannot be an artifact of knowing which arm was which.

**Decision rule fires (as pre-registered):** the owner's blind preference favors the harness arm → *fund the
full pre-registered A/B*. He separately authorized that budget the same day (option 1: "핵심 실험 하나만
돌린다" = the G3.6 verified-loop A/B). Both the rule and the budget answer point the same way.

**What this is NOT:** n=1. Per the pre-registration this fires **no** magnitude claim, no ship, no promotion.
One deliverable, one judge, one task class (Korean marketing copy). It says the full A/B is worth its budget
— nothing more. The 3× wall-clock cost stands unexplained by this result.

## Honest scope (binding)

**n = 1. This is an anecdote-grade pilot, not a measurement.** Per the pre-registration, **no ship, promote,
or magnitude claim may fire from this result in either direction** — the bar for that is a confirmatory
pre-registered A/B at floor_n ≥ 12 tasks, which this is not. The single decision this pilot informs: whether
the full A/B is worth its budget, or the line gets parked. A tie or a preference for the plain arm will be
published here verbatim.
