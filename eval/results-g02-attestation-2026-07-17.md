# RESULTS — G0.2 one-shot baseline attestation · 2026-07-17

**The fixture is saturated. The flagship A/B cannot run on it.** This is a negative result about our own
measuring instrument, published because the ledger's charter requires publishing nulls in the direction they
land.

## What was run

The hard precondition the ledger set for G3.6: before the flagship A/B may consume the fixture, a one-shot
baseline must FAIL on at least K of its tasks — otherwise the fixture has no headroom and the A/B is
measuring nothing. This had been PENDING (budget-gated) since G0.2 was built. The owner authorized the core
experiment's budget on 2026-07-17, so it ran.

**Method:** for each of the 6 fixture tasks, a plain one-shot opus (no tools, no iteration) received ONLY the
arm-visible bundle (`prompt.md` + the scaffold file) and emitted the finished file. Its output was scored by
the HIDDEN oracles it never saw. Runner: `scratchpad/attest.sh`; per-task JSON: `scratchpad/attest/raw.json`.

## Result — 6/6 passed, 0 failed

| task | hidden oracles passed | baseline verdict | wall |
|---|---:|---|---:|
| csv-parse | 2/2 | **pass** | 53 s |
| semver-compare | 2/2 | **pass** | 61 s |
| path-normalize | 2/2 | **pass** | 8 s |
| token-bucket | 2/2 | **pass** | 55 s |
| json-pointer | 2/2 | **pass** | 30 s |
| duration-parse | 2/2 | **pass** | 229 s |

**12/12 hidden oracles pass. Zero failures.** A single-shot model with no verification loop, no tests, and no
second look already solves every task in the fixture — including the semver numeric-vs-lexical trap and the
`~0`/`~1` escape-order trap that were added specifically to be discriminating.

## Why this kills the flagship A/B as designed

G3.6's primary metric is hidden-test pass rate across four arms (plain / one-shot stop-gate / prompt-matched
solo / the loop). If the *weakest* arm already scores 100%, every arm scores 100%. The experiment would
return a guaranteed null — **not evidence that the loop doesn't help, but evidence that the ruler has no
markings.** Spending the authorized 24 opus runs on it would buy a number that cannot move.

The G0.6 fresh reviewer called this exactly, months ahead of the data: *"6과제 전부 교과서급 … attestation을
실제로 돌리면 FAIL(=headroom 없음)할 가능성이 높고, 그러면 과제 강화 → hash 재동결이 필요하다."* The ledger's
own risk register put it first: *"G0.2 oracle 설계가 약하면 Stage 3 flagship A/B 전체가 무의미."* Both were
right, and the attestation is what turned that prediction into a fact.

## What the scaffold-proxy gate missed, and why

`validate.mjs` gates non-triviality with a deterministic proxy: every task's do-nothing scaffold must fail its
oracles. All 6 do — so the proxy passed and the fixture looked sound. But that proxy only proves *the task
requires work*. It cannot prove *the task requires more than one shot*, which is the only property the
flagship A/B needs. The proxy is not a substitute for the model-run attestation; it is a cheap floor beneath
it. This is now demonstrated, not argued.

## Consequence (binding)

- **G3.6 must NOT run on this fixture.** The 24-run budget stays unspent until the fixture discriminates.
- The fixture's frozen hash `7f8635df…` remains a **provisional** freeze, as G0.2's evidence already stated.
- To proceed, the fixture needs tasks (or oracles) where one-shot genuinely fails — the honest place to spend
  the next effort. Hardening changes the fixture, so it requires a re-freeze (`node validate.mjs --register`)
  and a fresh attestation; the old hash must not be carried over.

## What this does NOT say

It says nothing about whether the verified-completion loop helps. It says this fixture cannot answer that
question. The loop's guarantees remain machine-tested (`test/verified-loop-test.mjs`, 12/12); its *value* is
still unmeasured, and this attestation moved that from "unmeasured" to "unmeasurable **here**."
