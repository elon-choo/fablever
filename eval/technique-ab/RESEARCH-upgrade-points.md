# Research — productivity-upgrade points for fablever, drawn from well-reviewed agent harnesses

**Date:** 2026-06 · **Method:** GitHub/source investigation of the tools the community is praising
(lazycodex / oh-my-openagent, insane-search, insane-research, slides-grab) **+** a sibling project that
attacks fablever's *exact* problem (`fivetaku/fablize`). Goal: find changes that would *measurably* raise
productivity, screened through this project's rule — **adopt only what evidence supports; don't bloat.**

> Social-listening leg (Apify scrape of Threads/Instagram for sentiment + more tool names) is **blocked** —
> the Apify token is not on local disk (only ANTHROPIC keys are in `elon_branding/app-web/.env.local`); it
> lives in the linked Vercel cloud project and a `vercel env pull` was declined. The GitHub leg below does
> not need it. To run the social leg, the token must be provided.

## Sources

- LazyCodex / oh-my-openagent — https://github.com/code-yeongyu/oh-my-openagent · https://lazycodex.ai/
- insane-search — https://github.com/fivetaku/insane-search
- gptaku plugin marketplace (insane-research, show-me-the-prd, goaljaby) — https://github.com/fivetaku/gptaku_plugins
- slides-grab — https://github.com/vkehfdl1/slides-grab (also NomaDamas fork)
- **fablize** (the sibling "make Opus behave like Fable" plugin) — https://github.com/fivetaku/fablize

## The single most important find: `fablize` independently corroborates our central thesis

`fablize` is another author's evidence-based answer to the *same* question fablever asks — "what of Fable's
behavior transfers to Opus?" They ran **19 controlled A/B runs + 26 real sessions (~1,500 tool calls)** and
concluded:

- **Tied on closed work** (code, logic, builds).
- **Gap only on open-ended tasks** — "following an implication one step further."
- **Transferable = PROCEDURE:** verification, decomposition, investigation, early-stop detection.
- **Non-transferable = CAPABILITY:** out-of-spec defect discovery, creative depth, self-driven propagation.
  Their injection experiment: *"Opus could not reproduce the defects Fable found on its own."*

This is the **same split we measured independently**: our `xverify-value` eval found a single Opus catches
**34/34 _planted_ (enumerable) defects** but cross-model adds 0 recall — i.e. procedure-checkable defects are
at ceiling, while *out-of-spec discovery* is the real gap. Two independent teams, same conclusion. That
raises our confidence that **fablever should invest in procedure, not try to buy capability.**

### Verified from the source (cloned `fivetaku/fablize` read-only, not via a summary)

Reading the actual repo (`hooks/`, `docs/MEASUREMENT_PROTOCOL.md`, `README.md`) confirms — and sharpens —
the mechanism claims:

- **`hooks/router.sh` is a literal task-type router.** A `UserPromptSubmit` hook lowercases the prompt and
  `case`-matches signals, injecting *only the smallest matching pack*: `*debug*|*bug*|*error*|*traceback*|
  *crash*|*failing*|*"not working"*` → the investigation-protocol; `*html*|*svg*|*game*|*canvas*|*chart*|
  *render*|*website*` → the verification-grounding loop. Comment in the file: *"smallest matching pack only /
  overlap only when genuinely multi-category."* This is upgrade **#1 (task routing)** as ~30 lines of shell —
  proof the pattern is cheap and concrete, not aspirational.
- **`hooks/finish-the-work.sh` is a deterministic early-stop guard.** A `Stop` hook that parses the
  transcript's last assistant message; if it ended with a tool call or has no text it exits (still working),
  otherwise it catches promise-without-action. Loop-guarded by `stop_hook_active`. This is upgrade **#4**,
  already built and shippable in form.
- **Their measurement philosophy mirrors ours — and exposes a gap in ours.** `MEASUREMENT_PROTOCOL.md` states
  they found *toy seeded-trap A/Bs ceiling-bound and useless (3 rounds, ~3.3M tokens)* — **exactly our own
  experience** (xverify 34/34, multistep 100%, the surgical-evidence ceilings). They pivoted to
  **longitudinal out-of-band measurement**: 20% gate-OFF holdout sessions vs 80% ON (hashed by session_id,
  never exposed to the model), with outcome signals collected *post-hoc from git + transcripts*
  (reverted_edits, user_reinstructions, rework_commits, failed_verifications). Their **#1 question is the
  "harness paradox": does the gate's forced verification fill context with noise and HURT long-session
  attention? — "lift=0.0 is not success, it's a break-even warning."** They refuse always-on for any
  component until it clears a park-until-proven gate. That is the same `park-until-proven` ethos fablever
  publishes — and it names the one thing **fablever has not measured** (see upgrade #7).

## Social listening (Apify scrape: Threads + Instagram, n=650 deduped posts)

Scraped via the operator's Apify token (`watcher.data/search-threads-by-keywords`,
`apify/threads-profile-api-scraper`, `apify/instagram-hashtag-scraper`) across 18 keywords + 4 key profiles +
6 hashtags. This is **sentiment/popularity context, not evidence of a productivity gain** — but it confirms
*which* tools the community actually rallies behind, and it independently flags the same ones the mechanism
analysis prioritizes.

| tool | posts mentioning | total likes on those posts | likes/mention |
|---|---|---|---|
| codex (platform) | 153 | 7,018 | 46 |
| claude code (platform) | 93 | 5,516 | 59 |
| **lazycodex** | 44 | 1,710 | 39 |
| **insane-search** | 31 | 1,256 | 41 |
| **fablize** | 21 | 1,133 | **54** |
| **slides-grab** | 19 | 370 | 19 |
| cursor | 18 | 679 | 38 |
| oh-my-openagent/omo | 14 | 397 | 28 |
| gajae-code | 7 | 177 | 25 |
| ultraresearch / ultrawork | 6 / 6 | 250 / 107 | — |

**Reads that matter for us:**
- **`fablize` has the highest engagement-per-mention of any harness here (~54 likes/mention)** and its repo is
  among the most-shared GitHub links. A top post (@aldegad, 300♥) is explicitly about *"Fable5 going down →
  people reverse-engineering Fable's workflow and open-sourcing it so everyone can use it"* — i.e. **our
  project's exact thesis has real market pull.** That raises the value of getting fablever's procedural core
  right.
- The harness leaders (lazycodex, insane-search) match the mechanism analysis — community endorsement and
  technical substance point the same way, so the upgrade priorities below aren't just our taste.
- **Surfaced GitHub repos** (community-shared): `code-yeongyu/lazycodex`, `fivetaku/fablize`,
  `fivetaku/insane-search`, `code-yeongyu/oh-my-openagent`, `NomaDamas/slides-grab`, `vkehfdl1/slides-grab`,
  `Yeachan-Heo/gajae-code`, plus adjacent/low-signal `NomaDamas/k-skill`, `global-mindee/way`,
  `mitmirsein/horos`, `nexu-io/open-design` (1–2 mentions each; not coding-style harnesses — noted, not
  investigated).
- Dominant hashtags: `#aitools #claudecode #vibecoding #aicoding #codexcli #aiagents #buildinpublic` — the
  conversation is squarely Codex/Claude-Code agent harnesses, exactly fablever's lane.

**User-reported value themes** (from the 75 substantive benefit-mentioning posts — what people say *makes
these tools productive*, grounding the priorities in real voice, not just our read):
- **Context/token economy is the #1 praised property.** The most-liked workflow posts are about *keeping the
  context lean*: an Obsidian CLI praised because "token consumption is overwhelmingly low"; gptaku's own `/dd`
  plugin that offloads pasted logs/screenshots to local files so "the context doesn't get heavy, so it
  understands me better." This is direct user evidence for **#1 (route discipline, don't pad)** and **#7 (the
  harness paradox — always-on verbosity costs comprehension).** fablever's terseness value is exactly this,
  and it argues *against* an always-on evidence pass that bloats context.
- **Graceful mid-task re-steering + intent parsing** is prized (a top oho post: "even when the user cuts in
  with a vague 'look at this after, or not' it interprets intention well and edits the todo smartly").
- **A tiny, memorable command surface that routes to effort levels** is how lazycodex is taught (`ulw` /
  `$ulw-loop` / `$ulw-plan`→`$start-work`) — the routing idea again, made user-facing.
- gptaku describes `fablize` in his own words with **our exact thesis**: "I compared Fable and Opus on the
  same tasks and implemented from that; the deep reasoning (model capability) a knock-off can't beat, but the
  *work procedure and behavior* are implementable — forcing Fable's workflow so Opus moves like Fable."

## Mechanism inventory (what each tool actually does)

| tool | concrete mechanism | relevance to fablever |
|---|---|---|
| **fablize — per-task router** | injects a *different* discipline per task type: render-artifact → run-and-observe gate; multi-step → `goals.py` decomposition gate; debug → reproduce→hypotheses→trace; hard → suggest `/effort xhigh` | **HIGH** — routing is the answer to our own open problems (see #1) |
| **fablize — render-artifact verify hook** | `UserPromptSubmit` hook intercepts HTML/SVG/game/chart tasks, blocks "done" until execution is observed | **HIGH** — a *surgical* slice of the evidence-loop (see #3) |
| **fablize — early-stop hook** | deterministic catch for "I'll do X" / promise-without-action; blocks empty promises in real time | **MED** — makes our style's "don't end on a promise" enforceable (see #4) |
| **fablize — investigation protocol** | debug-only skill discipline: reproduce the failure, generate competing hypotheses, trace the causal chain | **MED** — task-routed, untested by us (see #5) |
| **oho — `/init-deep`** | walks the tree and **auto-generates hierarchical `AGENTS.md`** project memory before any codebase access | **HIGH** — closes the one gap our `local-seed` A/B flagged (see #2) |
| **oho — Ralph/ULW loop + todo-enforcer** | self-referential loop to 100% completion, evidence-audited, `.omo/ulw-loop/` state; yanks idle agents back | **MED** — same family as our evidence-loop work; corroborates, partly tested |
| **oho — hashline edits** | every read line tagged with a SHA256 `LINE#ID`; edits reference the hash; stale edits rejected | **LOW** — Claude Code's `Edit` already requires exact match + tracks file state |
| **oho — remove-ai-slops / comment-checker** | post-generation filter strips AI comment slop so code reads senior-written | **MED** — extends `fable_lint`; aligns with terseness value (see #6) |
| **oho — model routing / teammode (≤8 parallel)** | category→model routing; lead + parallel members via `team_*` tools | **LOW** — heavy orchestration; we already have adversarial-review + workflows |
| **insane-search** | escalating public-content reader (Phase 0 public APIs → 1 feeds/`.json`/rss → 2 `curl_cffi` TLS impersonation + cookie warming → 3 headless browser); stops at auth walls; no API keys | **ADJACENT** — a *research tool*, not a style change. Supply-chain caution: installs via `/plugin`/npx; do **not** auto-install |
| **insane-research** | 7-phase source-triangulated, citation-backed research pipeline | **ADJACENT** — overlaps our existing research workflows |
| **slides-grab** | plan→HTML-slide-per-file→point-and-edit linter for decks | **OUT OF SCOPE** — fablever is a coding-style transplant, not a deck generator |

## Prioritized upgrade points (each as a *candidate to A/B*, not a drop-in)

### 1. Task-type routing of the heavy disciplines — **the headline upgrade**
**Idea:** stop applying every heavy procedure uniformly; route each to the task type that benefits — exactly
what `fablize`'s per-task router does. **Why it's the big one:** it simultaneously resolves three of *our own*
measured problems — the evidence-loop **over-pads when applied to everything** (our 12–4 quality loss), the
style **costs ~14%/call everywhere** (route → pay only where it helps), and plan-first **won only on hard
multi-step** (route → don't tax easy tasks). Our currently-running `surgical-evidence` experiment is, in
effect, a first probe of "scope the discipline" — routing generalizes it. **Test:** a lightweight classifier
(render / multi-step / debug / simple) that gates which discipline fires; measure quality + cost vs always-on.

### 2. Auto-seed generator (an `/init-deep` for fablever) — **evidence-backed**
**Idea:** a command that generates hierarchical `AGENTS.md` convention files from the codebase. **Why:** our
`local-seed` A/B already *proved the downstream win* — adherence **11% → 78%** with a specific local file vs a
generic nudge. The one caveat we logged was "auto-discovery untested." `/init-deep` is existence-proof that
auto-generation is feasible. This converts a measured result into a shippable feature. **Test:** generate
seeds on N real repos, measure adherence lift vs hand-written and vs none. **RESULT — now run and CONFIRMED
([`RESULTS-autoseed.md`](RESULTS-autoseed.md)):** a generator that reads existing code reaches **88.9%**
adherence (GPT-5.5 oracle) vs the hand-written ceiling **100%** and the no-seed **33%** — and **100%** vs 78%
on the regex check. Auto-generation preserves (even slightly exceeds, deterministically) the hand-written
lift. The caveat is closed; the feature is viable.

### 3. A surgical evidence-loop — **tested across two rounds, CONFIRMED**
**Idea:** the full evidence-loop failed by padding *everything*; the fix is to demand a shown check without the
rewrite. **RESULT — run and CONFIRMED ([`RESULTS-surgical-r2.md`](RESULTS-surgical-r2.md)):** four lighter
packagings were tested (inline / surgical-patch / capped-loop / label-only); the decisive winner is **inline**
— bake a terse "no done-claim without a shown check" discipline into the **first** generation, with **no
second pass**. Inline cuts unsupported claims to **0%**, *halves* the reply (224→117 words), and the judge
prefers it **15–2** over baseline (p=0.0023) and **17–0** over the original full loop (pooled vs baseline
**26–6, p=0.0005**). The counter-intuitive finding: the full loop's failure was the *second pass itself*, not
the discipline. **Remaining refinement (untested):** further *scoping* the demand to render artifacts (where
"run it and observe" is cheap and decisive, per `fablize`'s router) — a narrower variant layered on inline.

### 4. Deterministic early-stop / no-promise check — **enforce an existing style rule**
**Idea:** a deterministic end-of-turn check for "I'll …" / "let me know when …" promise-without-action, which
fablever's style already discourages but does not enforce. **Why:** cheap, deterministic, directly targets a
known LLM failure mode. **Test:** measure promise-without-action rate with vs without the check on agentic
tasks.

### 5. Debug-routed investigation protocol — **untested, plausible**
**Idea:** for debugging tasks only, inject reproduce → competing-hypotheses → causal-trace. **Why:** distinct
from plan-first (which is general); `fablize` ships it as a separate validated discipline. **Test:** A/B on a
debugging task set; primary metric = root-cause-correctness, guard metric = length/quality.

### 6. Comment-slop lint — **small, aligned**
**Idea:** extend `fable_lint` with a rule flagging AI comment slop / restating-the-code comments. **Why:**
aligns with fablever's terseness value; deterministic and cheap. **Test:** precision/recall of the rule on a
labeled sample before wiring it in.

### 7. Out-of-band holdout measurement — **a methodology upgrade, the highest-leverage one**
**Idea:** adopt `fablize`'s measurement design to answer the question fablever's evals **cannot**: does the
always-on style/gate *help or hurt a long real coding session*? Method: a hashed **holdout** (e.g. 20% of
sessions run gate/style OFF), with outcome signals harvested **post-hoc and out-of-band** (git reverts, user
re-instructions, rework commits, failed verifications) — never injected into the model's context (in-context
logging changes the behavior you're measuring). **Why it's the highest-leverage item:** every eval we have is
single-turn and synthetic; our own EVALS.md flags "a long interactive coding session" as the one untested,
strongest setting. This is also the **"harness paradox" check** — our gate evals proved it *closes gaps*
(27–0) but never that always-on verification doesn't *cost* long-session attention. Until that's measured,
"adopt always-on" is unproven in the setting that matters most. **Test:** instrument fablever sessions
out-of-band, run ≥50 sessions, compare ON vs OFF holdout outcome signals stratified by task type. (Aligns
with — and is partly enabled by — upgrade #4's deterministic Stop hook as the logging point.)

## What NOT to adopt (consistent with the project's anti-bloat rule)
- **hashline edits** — Claude Code's `Edit` already enforces exact-match + state tracking; marginal gain.
- **teammode / model routing / 8 parallel members** — heavy orchestration already covered by
  adversarial-review + workflows; not a style-layer concern.
- **insane-search / insane-research / slides-grab** — useful *adjacent tools* a user may adopt separately, but
  not changes to fablever; and per supply-chain hygiene we do **not** auto-install `npx`/`/plugin` packages.

## Honest framing
These are *candidates*, screened for alignment, not adopted. Every "HIGH" item above earns an A/B before it
touches the install — the same bar plan-first / local-seed / evidence-loop had to clear. The strongest two
(#1 task-routing, #2 auto-seed) are backed by *both* an external corroboration (`fablize`'s 19+26-session
study) and our *own* prior measurements; they are the recommended next experiments.
