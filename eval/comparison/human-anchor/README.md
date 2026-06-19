# Human-anchor blind labeling kit

The decisive test the LLM-judge results can't provide: **real humans** labeling the same A0 (plain Opus) vs A1
(fablever) replies, blind. This converts "GPT-as-Julia prefers it" into "a person prefers it" and closes the
"your LLM judge is a gameable proxy" rebuttal.

## What's here
- `label.html` — self-contained labeling app (no network, no install). Double-click to open in a browser.
- `pairs.json` — the 96 blind pairs (question + Reply A + Reply B). **No information about which is fablever.**
- `key.json` — the hidden A0/A1 ↔ side-A/side-B mapping. **Do NOT open this before labeling.** Used only at scoring.
- `build-packet.mjs` — regenerates the packet from the committed responses (seeded, reproducible).
- `score-human.mjs` — scores your exported labels against the key and compares to the GPT-5.5 judges.

## How to run a labeling session
1. Open `label.html` in any browser.
2. For each item: read the question and both replies (you won't know which model produced which), then answer:
   - **(1)** which reply you'd rather receive to get your work done (A or B), and
   - **(2)** which one invents details you didn't ask for (A / B / neither).
   - Optional note.
3. Click **Next**. Progress is saved in the browser — you can stop anytime and resume later.
4. When done (all 96, or as many as you have time for — even 30 gives a usable result), click **Export results**
   → saves `human-labels.json`.

## How to score
```
node eval/comparison/human-anchor/score-human.mjs <path-to>/human-labels.json
```
Prints: human fablever-preference win-rate + exact binomial p + Wilson CI, the fabrication tally (which side humans
say invents more), per-category win-rate, and **agreement (Cohen's κ) with the GPT-5.5 panel**.

## For a credible result
- Use labelers **unfamiliar with fablever** (so they can't guess which reply is which from style).
- More labelers = stronger. Each labels the same blind pairs; average across people, and report inter-rater agreement.
- Pre-register what you'll claim (e.g., "humans prefer A1 > 50%, p<.05") before unsealing `key.json`.
- The replies are shown verbatim, so a fablever-savvy labeler could guess by style — this kit blinds *identity*, not
  *style*; that limitation is inherent to testing delivery and should be stated.

## Regenerate (optional)
```
node eval/comparison/human-anchor/build-packet.mjs   # rewrites pairs.json, key.json, label.html (seeded, balanced 48/48)
```
