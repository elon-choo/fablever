#!/usr/bin/env node
'use strict';
/*
 * orchestration-runtime-test.js — RUNTIME smoke test (closes round-1 H4/H5).
 *
 * orchestration-test.js only COMPILES the recipes (syntax). This file EXECUTES a recipe
 * against stub implementations of the Workflow primitives that faithfully reproduce the
 * documented contract — so the `parallel()` settle-to-null behavior and the RED-gate logic
 * the recipe depends on are exercised at runtime, not just asserted in comments.
 *
 * The stubs match the Workflow tool spec:
 *   parallel(thunks)            -> awaits all; a thunk that THROWS resolves to null (never rejects)
 *   pipeline(items, ...stages)  -> per-item stages; a stage that throws drops that item to null
 *   agent(prompt, opts)         -> here, a test double we control to return a verdict or throw
 *
 * This is NOT the real Workflow runtime (that lives in the harness); it is a contract-faithful
 * double, which is exactly what a unit smoke test should be.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

// --- contract-faithful stubs of the Workflow primitives ---
async function parallelStub(thunks) {
  // Defer each thunk into a then() so a SYNCHRONOUS throw becomes a rejection allSettled can catch
  // (faithful to the spec: a thunk that throws — sync or async — resolves to null, never rejects).
  const rs = await Promise.allSettled(thunks.map(t => Promise.resolve().then(() => t())));
  return rs.map(r => (r.status === 'fulfilled' ? r.value : null));
}
async function pipelineStub(items, ...stages) {
  return Promise.all(items.map(async (item, i) => {
    let v = item;
    for (const st of stages) { try { v = await st(v, item, i); } catch (_) { return null; } }
    return v;
  }));
}
const phaseStub = () => {};
const logStub = () => {};

(async () => {
  console.log('orchestration runtime smoke test:');

  // 1) parallel: a thrown thunk settles to null and never rejects the whole call
  {
    const r = await parallelStub([() => 1, () => { throw new Error('boom'); }, async () => 2]);
    ok('parallel(): thrown thunk -> null, siblings survive, no reject', JSON.stringify(r) === '[1,null,2]', JSON.stringify(r));
  }

  // 2) pipeline: a throwing stage drops only that item to null
  {
    const r = await pipelineStub([1, 2, 3], x => x * 10, x => { if (x === 20) throw new Error('drop'); return x + 1; });
    ok('pipeline(): throwing stage drops that item to null, others flow', JSON.stringify(r) === '[11,null,31]', JSON.stringify(r));
  }

  // 3) EXECUTE adversarial-verify against the stubs and exercise the RED gate
  const src = fs.readFileSync(path.join(ROOT, 'orchestration/recipes/adversarial-verify.mjs'), 'utf8')
    .replace(/^export\s+const\s+meta/m, 'const meta');
  const recipe = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', src);
  const ARTIFACT = 'This artifact is comfortably above the 200-character complexity floor so the recipe '
    + 'actually runs the skeptic panel instead of skipping it. '.repeat(3);
  const ARGS = { artifact: ARTIFACT, lenses: ['correctness', 'security', 'omission'] };
  const verdict = lens => ({ lens, refuted: false, confidence: 'low', defect_class: 'none', findings: [] });
  const run = (agentFn, args) => recipe(agentFn, parallelStub, pipelineStub, phaseStub, logStub, args || ARGS);

  // 3a) full panel returns schema-valid verdicts -> gate PASS
  {
    const res = await run(async () => verdict('L'));
    ok('adversarial-verify executes; RED gate PASSES when the full panel returns', res && res.gate && res.gate.red_gate_pass === true, JSON.stringify(res && res.gate));
  }
  // 3b) every skeptic throws -> parallel settles them to null -> gate FAIL
  {
    const res = await run(async () => { throw new Error('skeptic crashed'); });
    ok('RED gate FAILS when all skeptics crash (settle-to-null contract drives it)', res && res.gate && res.gate.red_gate_pass === false, JSON.stringify(res && res.gate));
  }
  // 3c) partial collapse (1 of 3 throws) -> gate FAIL (no lone-survivor pass)
  {
    let n = 0;
    const res = await run(async () => { n++; if (n === 1) throw new Error('one crashed'); return verdict('L'); });
    ok('RED gate FAILS on partial panel collapse (not all lenses returned)', res && res.gate && res.gate.red_gate_pass === false, JSON.stringify(res && res.gate));
  }
  // 3d) complexity floor: a tiny inline artifact is skipped, not paneled
  {
    const res = await run(async () => verdict('L'), { artifact: 'too short' });
    ok('complexity floor: tiny inline artifact is skipped (not paneled)', res && res.skipped === true, JSON.stringify(res));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
