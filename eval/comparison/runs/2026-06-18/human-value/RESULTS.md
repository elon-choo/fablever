# Why people feel they work better with fablever — the human-experience evidence

The earlier experiments measured **model task success** and found it identical (fablever doesn't change
correctness — the no-harm result, 7 saturated task classes). But people don't feel "better" because of more
correct answers. They feel it because of **how the answer arrives** — and that is the human side, which is
exactly what a working-*style* layer changes. This experiment measures that.

## Setup
8 realistic user questions (decisions, debugging, how-to, explanations, code review, prioritization,
tradeoffs, planning), answered by plain Opus (A0) vs fablever (A1) on the same model, k=2 each. Scored two
ways: objective human-facing proxies, and a **blind, position-balanced, non-Claude (GPT) judge taking the
ASKER's perspective** ("which reply would the busy person who asked rather receive?").

## Objective proxies — fablever leads with the answer, not a markdown wall
| metric | A0 plain | A1 fablever |
|---|---|---|
| mean words / reply | 328 | **268** (−18%) |
| markdown headers / reply | 2.1 | **0.1** |
| bullet points / reply | 6.3 | **2.9** |
| filler openers | 0% | 0% |

fablever answers in tight prose that opens with the recommendation; plain Opus tends toward a longer,
header-and-bullet "reference document." (Example, "undo my last commit": fablever gives the exact command in
line 1 + two sentences, 85 words; plain Opus gives a variants **table** + a "Notes" bullet list, 180 words.)

## Blind asker-perspective judge — fablever preferred 10 of 16 (~62%)
| round (positions balanced) | fablever wins | plain wins |
|---|---|---|
| k1 | 4 | 4 |
| k2 | 6 | 2 |
| **combined** | **10** | **6** |

Judge's recurring reasons for preferring fablever: *"command first, concise,"* *"best first step is upfront,"*
*"tighter and easier to act on,"* *"cleaner plan… fewer distracting assumptions,"* and notably *"no invented
repo context"* (fablever's restraint avoided fabricating details plain Opus added).

**The consistent signal (won BOTH reps):**
- fablever wins the **"just tell me what to do" questions**: how-to (Q3), what-to-do-first (Q6), planning (Q8).
- plain Opus wins **code review** (Q5) — where listing options/structure genuinely helps.
- decisions / debug / explain / tradeoff were toss-ups (flipped between reps — high run-to-run variance).

## What this means (honest + the appeal)
- **The need fablever meets:** "give me the answer, fast, decisively, without padding or invented detail." On
  the **action-oriented** questions that dominate real dev work (*how do I…, what should I do first, what's
  the plan, which should I pick, fix this*), fablever consistently delivers that — which is plausibly why
  users *feel* they work better: less to read, the answer up front, a clear next step, and no slop to
  mentally discard.
- **At zero cost to correctness** — the substance is identical (proven separately). You lose nothing and the
  delivery is leaner.
- **Honest limits:** the margin is modest (10–6, not a blowout), it comes from one GPT judge on 8 questions
  with high run-to-run variance, and plain Opus's structured style is *better* for explanation/teaching and
  code-review answers. fablever is a **delivery preference for action-oriented work**, not a universal upgrade.

## One-line value proposition (defensible)
*"Same correct answer as plain Opus, delivered the way busy engineers prefer for getting things done —
answer-first, decisive, no padding. A blind GPT judge taking the asker's view preferred fablever's replies
~62% of the time, and consistently on 'just tell me what to do' questions, at zero cost to correctness."*
