# Judge rubric & procedure — Axis A (descriptive metrics only)

This rubric governs §4c (pairwise preference) and the doc/planning rubric scores. **Neither produces a
headline** (protocol §0). The Axis-A headline is the executable coding pass rate (§4b).

## Judges

- **≥2 judges, including at least one non-Claude model** (e.g. one GPT, one Gemini), plus a **human
  spot-check** of a random 20% subset. Anchor every judgment to **task success first**, style second.
- Each judge records a **free-text rationale** per item. Rationales are committed so a leaked-condition
  tell (e.g. "the terse one is obviously fablever") is auditable after the fact.
- Report **inter-judge agreement**; disagreements are shown, not averaged away silently.

## Mandatory format-normalization (before any judgment)

fablever's style (terseness, no "I'll/Let me", outcome-first) **leaks the condition on sight**, so raw
pairwise judging is not blind. Before judging, normalize each response pair to suppress form tells:

1. Strip leading/trailing pleasantries and self-narration openers from BOTH responses.
2. Normalize markdown (flatten headers/bullets to plain prose) so structure isn't a tell.
3. Do **not** equalize length by padding/cutting content — instead instruct the judge to **ignore length
   and formatting** and judge only substance; the rationale must not cite length/format.
4. Randomize L/R order per item; record the seed.

If a pair remains obviously identifiable after normalization, that item is marked **"condition leaked"**
and its preference is excluded from even the descriptive tally (kept only as a logged note).

## Pairwise preference dimensions (§4c)

For each task, judge picks A-better / B-better / tie on each, with a one-line reason:

| dimension | question |
|---|---|
| **(i) task success** *(primary descriptive)* | which response more correctly/usefully does the task? |
| (ii) decisiveness | which commits to a recommendation instead of surveying options? |
| (iii) outcome-first | which leads with the answer rather than narrating the path? |
| (iv) restraint | which avoids unrequested scope/over-building? |

Report win-rates per dimension **in full** (all four, both domains). With n=6 tasks/domain a binomial sign
test may be shown as **descriptive only** (it is underpowered); no conclusion rests on it.

> **Round-2 H-1 caveat:** dimensions (ii) decisiveness and (iii) outcome-first **are** the style signature
> the layer installs — scoring them partly re-reads §4a's manipulation-check, not an independent
> preference, and the terseness/length they correlate with also leaks the condition. Report them, but they
> can only ever indicate "the layer engaged," never task value, and **cannot upgrade a null §4b headline.**

## Doc/planning rubric (1–5 per anchor)

Score each task's listed anchors (in `tasks/doc-planning.md`) 1–5: 1 = absent, 3 = partially, 5 = fully.
Sum/mean per task. **Directional color only** — never a headline.

## Anti-gaming guards

- A shorter/terser answer is **not** automatically better — if it omits required substance it scores
  lower on (i) task success and on the rubric anchors. The judge prompt states this explicitly.
- The judge is never told which condition produced which response, and the rationale is checked for
  length/format leakage during the human spot-check.
