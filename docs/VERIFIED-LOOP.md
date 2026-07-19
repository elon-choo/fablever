# The bounded verified-completion loop (opt-in)

An honest account of the flagship Stage-3 mechanism, and — just as important — of what it deliberately is **not**.

## What it is

An **opt-in, default-off** state machine that completes work against *explicit, verifiable acceptance
criteria* instead of against a model's own say-so. It picks an unresolved criterion, acts once, verifies
with an **executable oracle** (a check that runs and exits 0 for pass), records a criterion-bound evidence
receipt, checkpoints, and stops. Completion is granted by the **gate** — an executable check passing — never
by prose. State lives in a single append-only authority (the run-ledger), so a doctored cache cannot forge a
"done."

Its whole value proposition is subtractive: it removes the failure mode where an agent *declares* success
without producing checkable evidence. It does not make the model smarter.

## The ceiling (read this before you expect a miracle)

fablever is a **style/structure transplant, not a capability transplant.** Capability lives in the weights.
This loop is a scaffold — a *multiplier* on the base model's competence, never a substitute for it. On a
strong model the honest expectation is **"closer to Fable, never equal"**: the loop can stop a capable model
from cutting corners on verification; it cannot lift the model above its own ceiling.

Consequently this document makes **no effect-size claim.** Whether the loop raises hidden-test pass rate on
Opus — and at what token cost — is decided by the pre-registered A/B in `eval/opus-prereg/verified-loop-ab-2026-07.prereg.json`
against the `eval/opus-fixture/` oracles, comparing the loop **against a prompt-matched solo control** (same
criteria, no durable state). That experiment is budget-gated and has **not been run**; until it is, no
magnitude is asserted anywhere. A null result — the loop matching solo at no benefit — is a valid, publishable
outcome and would mean the loop should ship parked, not tuned until it "wins."

## Boundaries — the disproven forms this loop does NOT take

Each of these was refuted by an earlier controlled A/B (see `EVIDENCE.md` / the ledger NON-GOALS). They are
listed here so a future maintainer does not "helpfully" re-add them.

- **N2 — no 500-iteration Oracle loop.** The disproven ancestor iterated generation up to hundreds of times.
  This loop is *bounded* by a hard cap (default 2, hard max 3, from the retry-budget config); on cap
  exhaustion it **halts and surfaces** an open-debt entry to a human rather than looping away. More iteration
  did not buy recall; a small bounded loop is the honest kernel.

- **N5 — no second-pass rewrite for evidence discipline.** A separate "rewrite it to add evidence" pass only
  padded length and the judge preferred the leaner original. Evidence here is baked in on the first action
  (the receipt is recorded as the action completes), never bolted on by a follow-up rewrite round.

- **N6 — no generation-round escalation; retry is repair-only.** The generation-round cap stays **1**. A
  retry is a **repair pass anchored to a captured executable FAIL artifact**, not a fresh generation round —
  it cannot even run without a real FAIL to point at. "Simpler won; stop at one generation round" is honored;
  escalating generation to chase recall is exactly what this avoids.

- **N9 — no judge-preference-triggered retry.** A retry is triggered **only** by an executable check FAIL.
  A judge or critique output that "wants another try" with no failing oracle is treated as inert prose and
  triggers nothing — a negative test in `test/verified-loop-test.mjs` enforces it. Retrying on preference is
  the loop-shaped version of N5, and it is barred.

## Where the guarantees are enforced

None of the above is a promise in prose. Each is a machine-checked assertion in
`test/verified-loop-test.mjs` (fake-done cannot complete; FAIL→one anchored repair / PASS→immediate stop;
cap exhaustion writes open-debt to the ledger; judge output cannot trigger retry; repair needs a captured
FAIL artifact; the module is absent from every default path; an atomic single-file task ends after its first
valid evidence with no loop ceremony). If a change breaks a boundary, that test fails.
