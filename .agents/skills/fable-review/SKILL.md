---
name: fable-review
description: Adversarially review a change or artifact before it is locked in — try to break it, find the failure paths, rate severity — instead of confirming it looks fine. Use before merging/shipping/finalizing, or when the user says "review this", "poke holes", "what breaks", "find the weaknesses", "red-team it", "what did I miss". Finds and rates defects; does not rewrite. Pulled on demand; not always-on.
---

# fable-review — try to break it before it ships, don't just nod at it

A review that sets out to confirm an artifact finds little; a review that sets out to **break** it finds
what matters. This skill is the adversarial pass — for code diffs, specs, migration/implementation plans,
prompts, and designs — before a decision is locked in. It rates defects by severity; it does **not** fix
them in place (fixing is a separate, explicit step so the reviewer and the fixer stay independent).

Honest scope note: on *enumerable, planted* defects a single strong model is already near ceiling, so a
second independent reviewer added **0 extra recall** there (`eval/xverify-value/RESULTS.md`). The value of
an adversarial pass is on **judgment/design misses and untested failure paths**, not on re-counting bugs a
careful first read already caught.

## When to use this

- Before merge / ship / finalize / lock-in of a change or artifact.
- The user says "review", "poke holes", "what breaks", "find weaknesses", "red-team it", "what did I
  miss", "attack this".

## When NOT to use this

- You are being asked to *implement* or *fix*, not to assess — do that instead.
- A throwaway draft with no decision riding on it.

## Procedure

1. **Assume it is wrong and find out how.** For each part, ask: what input, ordering, failure, or
   adversarial user makes this break or mislead?
2. **Walk the real failure paths:** silent failures and fire-and-forget, race conditions, missing
   timeouts/retries, injection/encoding bypasses, unhandled error branches, boundary and empty/null cases,
   permission and trust assumptions, claims in a spec that the implementation cannot guarantee.
3. **Cite evidence for each finding** — the line, the input, the sequence that triggers it. No hand-waving.
4. **Rate severity** Critical / High / Medium / Low, and say what is needed to close each.
5. **Do not rewrite the artifact.** Report the findings; let the fix be a separate, deliberate step. If
   you find nothing real, say so plainly rather than inventing nits.

## Expected output

A severity-rated findings list, each with concrete evidence and a close condition — or an explicit "no
real defects found; here is what I checked".

## Verification

For each finding, could you actually reproduce or point to it? Drop anything you cannot ground — a
plausible-but-unverifiable finding is noise. Confirm you reviewed the high-risk surfaces, not just the
easy ones.

## Failure cases

- Confirming "looks good" without trying any breaking input.
- Listing style nits while missing a real failure path.
- Quietly rewriting the code instead of reporting the defect (collapses reviewer and fixer into one).
