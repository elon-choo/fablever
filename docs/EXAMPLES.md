# Examples — before / after (and where it does NOT help)

These illustrate the *behavior* fablever steers toward. They are not per-example benchmarks; the measured
claims (and their limits) live in [`../EVIDENCE.md`](../EVIDENCE.md) and the linked evals. The last section
is deliberately about cases where fablever does **nothing** — that honesty is the point.

---

## 1. Scope discipline — change only what was asked

> **User:** Fix the off-by-one in `paginate()`. Don't touch anything else.

**Without the layer (typical drift):**
```
Fixed the off-by-one. While I was in there I also renamed the helper for clarity,
extracted a constant, and reformatted the file. Added a couple of tests too.
```
**With the layer (scope held):**
```
Fixed the off-by-one in paginate() (line 42: `<=` → `<`). Nothing else changed.
Out of scope, noted but not changed: the helper name is inconsistent with its caller —
flag if you want a separate cleanup.
```
This is fablever's most robust, judge-independent result: **0% scope violations vs plain 42%**
(`eval/style-only-ablation/`). The `fable-scope-guard` skill encodes it for Codex.

---

## 2. Evidence-grounded completion — no unsupported "it works"

> **User:** Did the migration script work?

**Without (decisiveness's honest cost):**
```
Yes, all done — the migration works now.
```
**With (`fable-evidence-done`):**
```
Ran it: `node migrate.mjs` exited 0 and `SELECT count(*) FROM users` returns 10,412
(was 10,412 pre-migration, 0 rows dropped). Migration verified.
```
or, honestly, when not yet checked:
```
Script is written but NOT verified yet — I haven't run it against the DB.
```
Decisiveness raises unsupported "it works" claims (8.3% vs plain 2.1%); fablever mitigates this in-tool with
`fable_lint`'s `unsupported-done-claim` rule (`eval/unsupported-claim-regression/`).

---

## 3. Delivery gate — BLOCK → fix → PASS

> **User:** Finalize the launch email and send it.

**Gate run (`fable_check` / `fable-delivery-gate`):**
```
Definition of done: (1) names the launch date, (2) one clear CTA, (3) working signup link,
(4) no unverified metrics.
Check → BLOCK: criterion (3) fails — the signup link is a placeholder (example.com);
criterion (4) fails — "trusted by thousands" has no source.
```
**After fix, re-run:**
```
Check → PASS: date present, single CTA, signup link resolves, the unverifiable claim removed.
```
The gate is not auto-send: a BLOCKed deliverable is fixed and re-checked first. Honest bound: against a
*generic* "make it better" second pass the gate shows **no edge** — its value is checking against *stated*
acceptance criteria (`eval/comparison/fable-check-sim/`).

---

## 4. Codex — AGENTS-only first install

The safest way to try fablever in Codex CLI, no key, fully reversible:
```bash
node install.mjs --codex-style-only          # writes one marker block into CODEX_HOME/AGENTS.md
node install.mjs --codex-style-only --dry-run # preview first; writes nothing
node install.mjs --uninstall --codex          # removes only fablever's marker block
```
This is the instruction layer only — no hooks, no MCP, no skills, no network. Add the rest later with
`--codex-full`.

---

## 5. Codex — on-demand skills

After `node install.mjs --codex-full`, the `fable-*` skills are discoverable in Codex and load only when
their description matches the task:

> **User:** I'm about to merge this migration plan — poke holes in it first.

Codex pulls `fable-review`, which runs the adversarial pass (try to break it, walk the failure paths, rate
severity) instead of confirming it looks fine — and reports findings without rewriting the plan. Skills are
context-cheap because they load on demand, not always-on. Confirm availability with `/skills` if your Codex
build supports Agent Skills.

---

## Where fablever does NOT help (on purpose)

- **It will not make answers higher-quality.** On raw output quality it ties plain Claude (a wash; one judge
  slightly trails) — `eval/style-only-ablation/`.
- **It will not lower your bill.** The always-on style adds ~14%/call — `eval/cost-latency/`.
- **It will not catch more enumerable bugs via a second model.** Cross-model xverify added **0** recall on
  planted defects a strong model already finds — `eval/xverify-value/`.
- **It will not close multi-step completeness gaps style-only didn't already cover.** The default gate added
  **+0** there — `eval/multistep-gate/`.
- **It is not a proven productivity tool.** The developer A/B was a published null —
  `eval/comparison/productivity-ab/`.

If you want any of those, fablever is the wrong tool. If you want scope discipline, evidence-grounded
completion, and a check before delivery — that is exactly what it does.
