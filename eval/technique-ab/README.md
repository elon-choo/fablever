# Technique A/Bs — testing *generic* techniques on their own merits (not porting a library)

## What this is — and what it is NOT

These A/Bs test whether **generic, well-known software-engineering techniques** improve fablever when bolted
on:

1. **Evidence loop** — don't claim "done/works" until a check shows it. *(Refined over two follow-up rounds
   into the packaging that actually works — see "the evidence-loop arc" below.)*
2. **Plan-first artifact** — write the plan before you build.
3. **Local-context seeding** — put a module's conventions in a local file where the work happens. *(Follow-up:
   the seed can be **auto-generated** from the code, not just hand-written — confirmed below.)*

> **Provenance (important, stated plainly):** these ideas are old and universal — they appear in many
> harnesses and in decades of engineering practice. We noticed them while looking at two popular Codex/
> Claude harnesses (`gajae-code`, `lazycodex`), but this is **NOT a port of either**. Each technique here
> is our **own implementation**, applied to **our** style layer, measured by **our own A/B** with an
> independent judge. We are validating *the idea*, on its merits, with evidence — not copying a feature and
> not claiming credit for inventing the idea. If a result is positive, it means *the technique* helped
> fablever in a measured test; it says nothing about any library's implementation.

The evaluation judge is **GPT-5.5 (via the Codex CLI)** — a different lab from the Opus generator, chosen
after the real-log replay showed forced-choice results can be judge-dependent. Generation is fablever-on
Opus in both arms; the only variable is the technique.

## Results — every technique resolved to a measured verdict

| technique | headline result | verdict | file |
|---|---|---|---|
| **Plan-first artifact** | on hard 5-part tasks, plan-then-execute beat direct **9–1** (90%, **p=0.022**, GPT-5.5) | **ADOPT** for hard multi-step work | [`RESULTS-plan-first.md`](RESULTS-plan-first.md) |
| **Local-context seeding** | convention adherence: no-seed **11%** → local-seed **78%** → generic-nudge **22%** | **ADOPT** — a specific local file >> a vague "follow conventions" nudge | [`RESULTS-local-seed.md`](RESULTS-local-seed.md) |
| **↳ Auto-generated seed** | a generator reading existing code reaches **88.9%** adherence vs the hand-written ceiling **100%** (regex: auto **100%** vs hand 78%); no-seed 33% | **ADOPT** — auto-generation preserves the lift; closes local-seed's untested auto-discovery gap → a shippable feature | [`RESULTS-autoseed.md`](RESULTS-autoseed.md) |
| **Evidence loop** (full rewrite pass) | hit its metric but GPT-5.5 preferred the leaner baseline **12–4** (length 217→384) | **DO NOT adopt as a 2nd pass** — over-pads | [`RESULTS-evidence-loop.md`](RESULTS-evidence-loop.md) |
| **↳ Evidence loop, refined (inline)** | baking the discipline into the **first pass** cuts unsupported→**0%**, *halves* length (224→117w), and beats baseline **15–2** (p=0.0023) + the original loop **17–0**; pooled vs baseline **26–6 (p=0.0005)** | **ADOPT the inline packaging** — the discipline belongs in the first pass, not a rewrite | [`RESULTS-surgical-r2.md`](RESULTS-surgical-r2.md), [`RESULTS-surgical-evidence.md`](RESULTS-surgical-evidence.md) |

### What each result means for fablever

- **Plan-first earns a place** for genuinely hard, many-part tasks — externalizing the plan first
  measurably improves the deliverable, even though the multistep-gate eval showed fablever already covers
  the *checklist*. The plan helps with organization/correctness beyond bare part-coverage. Cost: one extra
  model call, so gate it to hard tasks rather than running it always.
- **Local-context seeding earns a place** and quantifies *why* hierarchical `AGENTS.md` is worth it: a
  concrete local convention raised adherence to **78%** vs **22%** for a generic nudge and **11%** for
  nothing. The specificity is the value. **Follow-up — the auto-discovery caveat is now closed:** a generator
  that reads the module's existing code and writes the `AGENTS.md` itself reaches **88.9%** adherence (vs the
  hand-written **100%** ceiling; **100%** on the regex check) — so the lift is reachable *automatically*. That
  turns the observation into a shippable `/init-deep`-style feature.
- **The evidence-loop arc — a negative that resolved into a win by fixing the packaging.** As a full *second*
  rewrite pass the loop hit its metric but nearly doubled length and the judge preferred the leaner baseline
  (12–4) — fablever's whole value is terse decisiveness, and a pass that pads it is a net loss. The lesson was
  that the technique is right but the packaging must be surgical. **Two follow-up rounds tested four lighter
  packagings; the winner is decisive and counter-intuitive:** don't add a verification *pass* at all — bake a
  terse evidence discipline into the **first** generation ("inline"). Inline cuts unsupported claims to **0%**,
  *halves* the reply length, and the judge prefers it **15–2** over baseline (p=0.0023) and **17–0** over the
  original loop (pooled vs baseline **26–6, p=0.0005**). The full loop's failure was the *second pass itself*.
  This is the "surgical" answer the first round predicted — found, and confirmed at significance.

## Where these came from — upgrade research

These techniques were chosen after a mechanism + social-listening study of the harnesses the community
actually rallies behind (lazycodex/oho, insane-search, slides-grab) and a sibling project, `fivetaku/fablize`
(another evidence-based "make Opus behave like Fable" plugin whose 19-A/B + 26-session study reached the same
procedure-transfers-capability-doesn't split we measured). Full writeup + the prioritized upgrade list:
[`RESEARCH-upgrade-points.md`](RESEARCH-upgrade-points.md).

## Honest limits

- Single judge model (GPT-5.5); modest per-round n (plan-first 12, local-seed 9, auto-seed 9, evidence-loop
  16+18). Inline-vs-baseline is the firmest (pooled n=32, p=0.0005); the rest are directional.
- The local-seed/auto-seed tests still hand the file to the model — real seeding's *auto-discovery near the
  code* is untested, so those adherence numbers are a **lower bound**.
- "Adopt" here means *the technique earned a measured win in this harness* — wiring it into fablever's
  install is a separate, gated change, not done by these runs.

## Reproduce

Needs a local `claude` (Opus generator) and the `codex` CLI authenticated for GPT-5.5 (the OpenAI API key
path is unused here). Read each runner before running (supply-chain hygiene). Raw generations and every
verdict are committed.

```bash
node run-plan-first.mjs        # gen -> GPT-5.5 judge -> report
node run-local-seed.mjs        # gen -> GPT-5.5 adherence oracle -> report
node run-autoseed.mjs          # generate AGENTS.md from code -> A/B/D adherence (GPT-5.5)
node run-evidence-loop.mjs     # the original full-rewrite loop (the negative)
node run-surgical-evidence.mjs # round 1: four lighter packagings vs baseline
node run-surgical-r2.mjs       # round 2: confirm the inline winner (3-way, pooled)
```
