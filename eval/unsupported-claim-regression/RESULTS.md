# Unsupported-claim regression — the lint rule vs a labeled fixture

> Deterministic, offline (no keys, no network, no model calls). This guards the `unsupported-done-claim`
> rule in `mcp/src/server.js` -> `fableLint`, fablever's product-side answer to its **own** published
> negative: the style-only ablation measured fablever asserting "it works" without a shown check **8.3%**
> of the time vs plain Claude **2.1%** (`eval/style-only-ablation/RESULTS.md`). The rule does not change
> that ablation; it is a forward guard so the discipline now ships *in the tool*. Reproduce:
> `node eval/unsupported-claim-regression/run.mjs`.

Fixture: **18** labeled cases (EN + KO), binary: should the rule **flag** (unsupported completion claim) or **pass** (check shown, or marked not-verified, or no claim).

| metric | value |
|---|---|
| accuracy | **100.0%** (18/18) |
| precision (of flagged, how many were truly unsupported) | 100.0% |
| recall (of unsupported, how many were flagged) | 100.0% |
| confusion | TP=7 TN=11 FP=0 FN=0 |

## Misclassified

None — every labeled case classified as expected.

## Known limits (documented, not hidden)

The rule is a **wording proxy**, deliberately keyword-anchored — it is not a verifier and cannot know if a cited check is real. Two honest misses kept in the fixture as `hard_cases_known_limits`:

- `hard-1` -> rule says **flag**. a vague verbal 'I tested it' carries no concrete token (file, file:line, `command`, 'passes'), so the rule FLAGS it. Defensible — 'I tested it' is not a shown check — but it shows the rule's bias: it wants a checkable artifact, not a verbal assertion of testing. A model that genuinely ran a test should cite it.
- `hard-2` -> rule says **pass**. completion implied by tone with no trigger word ('all green', 'ship it') — the keyword rule MISSES this. Honest miss: the proxy is lexical, so tone-only completion claims slip through.

_The proxy catches the common, lexical failure (a bare "it works" / "고쳤고 작동합니다"); it will miss completion implied purely by tone. That ceiling is stated, not papered over._
