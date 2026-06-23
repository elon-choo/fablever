# Technique A/Bs — testing *generic* techniques on their own merits (not porting a library)

## What this is — and what it is NOT

These three A/Bs test whether three **generic, well-known software-engineering techniques** improve
fablever when bolted on:

1. **Evidence loop** — don't claim "done/works" until a check shows it.
2. **Plan-first artifact** — write the plan before you build.
3. **Local-context seeding** — put a module's conventions in a local file where the work happens.

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

## Results — 2 earned adoption, 1 did not (as implemented)

| technique | headline result | verdict | file |
|---|---|---|---|
| **Plan-first artifact** | on hard 5-part tasks, plan-then-execute beat direct **9–1** (90%, **p=0.022**, GPT-5.5) | **ADOPT** for hard multi-step work | [`RESULTS-plan-first.md`](RESULTS-plan-first.md) |
| **Local-context seeding** | convention adherence: no-seed **11%** → local-seed **78%** → generic-nudge **22%** | **ADOPT** — a specific local file >> a vague "follow conventions" nudge | [`RESULTS-local-seed.md`](RESULTS-local-seed.md) |
| **Evidence loop** | cut unsupported claims 18.8%→12.5% and raised evidence 56%→75% (deterministic) **but** GPT-5.5 preferred the leaner baseline **12–4** (p=0.077); length 217→384 words | **DO NOT adopt as-is** — over-corrects into verbosity; needs a *surgical* version | [`RESULTS-evidence-loop.md`](RESULTS-evidence-loop.md) |

### What each result means for fablever

- **Plan-first earns a place** for genuinely hard, many-part tasks — externalizing the plan first
  measurably improves the deliverable, even though the multistep-gate eval showed fablever already covers
  the *checklist*. The plan helps with organization/correctness beyond bare part-coverage. Cost: one extra
  model call, so gate it to hard tasks rather than running it always.
- **Local-context seeding earns a place** and quantifies *why* hierarchical `AGENTS.md` is worth it: a
  concrete local convention raised adherence to **78%** vs **22%** for a generic nudge and **11%** for
  nothing. The specificity is the value. (Lower-bound: the file was handed to the model; real seeding's
  auto-discovery is untested, so the true effect is ≥ this.)
- **The evidence loop is the honest negative.** It *works* on its target metric (fewer unsupported claims,
  more shown checks) — but as a full rewrite pass it nearly doubles length and the judge prefers fablever's
  leaner baseline. fablever's whole value is terse decisiveness; an evidence pass that pads it is a net
  loss. The lesson: the technique is right but the *packaging* must be surgical — add a check only where a
  claim is genuinely unbacked, don't rewrite. That refinement is the natural next experiment, not yet run.

## Honest limits

- Single judge model (GPT-5.5); modest n (16 / 12 / 9). Directional, not definitive.
- The local-seed test is a **lower bound** (no auto-discovery of the file).
- "Adopt" here means *the technique earned a measured win in this harness* — wiring it into fablever's
  install is a separate, gated change, not done by these runs.

## Reproduce

Needs a local `claude` (Opus generator) and the `codex` CLI authenticated for GPT-5.5 (the OpenAI API key
path is unused here). Read each runner before running (supply-chain hygiene). Raw generations and every
verdict are committed.

```bash
node run-evidence-loop.mjs    # gen -> metrics -> GPT-5.5 judge -> report
node run-plan-first.mjs       # gen -> GPT-5.5 judge -> report
node run-local-seed.mjs       # gen -> GPT-5.5 adherence oracle -> report
```
