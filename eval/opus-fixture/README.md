# Opus hard-eval fixture

This directory is the frozen, offline coding-task fixture for the Opus harness upgrade. Each task is
multi-part and has executable behavioral checks that are kept outside the material given to an
experimental arm.

For a task, the arm-visible bundle is exactly:

- `tasks/<task-id>/prompt.md`
- `tasks/<task-id>/scaffold/`

The `_oracle/` tree is evaluator-only. It contains the executable checks, a correct implementation, and
a single-defect implementation used to prove that the checks can both pass and fail. Never copy that tree
into an arm workspace, and never add its paths or filenames to an arm-visible prompt or scaffold.

Run the complete offline validation with:

```bash
node eval/opus-fixture/validate.mjs
```

The validator proves:

- the frozen task floor is met;
- every arm-visible bundle is free of evaluator-only names, and a seeded leak is rejected;
- every starter scaffold fails at least one behavioral check;
- every task has at least two executable checks;
- every check passes the correct implementation and rejects the planted-defect implementation;
- the registered fixture SHA-256 still matches the sorted `tasks/` + `_oracle/` content digest.

`FIXTURE-HASH.txt` is written when no registered hash exists. Once present, content drift is a validation
failure rather than an automatic re-registration.

## Model non-triviality attestation

The deterministic scaffold baseline is always enforced. A later, budget-approved one-shot Opus baseline
may additionally be recorded at `_oracle/non-triviality-attestation.json`:

```json
{
  "one_shot_baseline": {
    "csv-parse": { "failed": true }
  },
  "recorded_at": "2026-07-16T00:00:00Z",
  "note": "How the one-shot baseline was run."
}
```

When present, the file must contain a boolean `failed` result for every frozen task and meet the same
non-triviality floor. Do not create this file without an actual model run.
