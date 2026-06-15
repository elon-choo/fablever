#!/usr/bin/env node
'use strict';
/*
 * orchestration-test.js — zero-dependency checks for the orchestration layer.
 *
 * Workflow recipes run inside an async function body with injected globals
 * (agent/parallel/pipeline/phase/log/args) and use top-level await + return, so
 * `node --check` (which parses them as modules) rejects them at the first return.
 * We instead compile each as an AsyncFunction body — the same shape the Workflow
 * runtime uses — which validates syntax WITHOUT executing or needing the globals.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const RECIPES = [
  'orchestration/recipes/adversarial-verify.mjs',
  'orchestration/recipes/divergent-explore.mjs',
  'orchestration/recipes/decompose-first.mjs',
  'orchestration/recipes/pipeline-map.mjs',
  'orchestration/recipes/judge-panel.mjs',
  'eval/ab-harness.mjs',
];

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('orchestration layer:');

for (const rel of RECIPES) {
  const p = path.join(ROOT, rel);
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch (e) { ok(rel + ' exists', false, e.message); continue; }

  // 1) compiles as a workflow body (syntax valid)
  const body = src.replace(/^export\s+const\s+meta/m, 'const meta');
  try {
    // eslint-disable-next-line no-new
    new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', body);
    ok(rel + ' compiles', true);
  } catch (e) { ok(rel + ' compiles', false, e.message); }

  // 2) declares a meta with a name (launchable by the Workflow tool)
  ok(rel + ' has meta.name', /export\s+const\s+meta\s*=\s*\{[\s\S]*name\s*:/.test(src));

  // 3) parses string args defensively (the stringified-args footgun)
  ok(rel + ' parses string args', /typeof\s+a\s*===\s*'string'[\s\S]*JSON\.parse/.test(src));
}

// 4) every fan-out recipe states agent count is a cost denominator, not a success metric
for (const rel of ['orchestration/recipes/adversarial-verify.mjs', 'orchestration/recipes/divergent-explore.mjs', 'orchestration/recipes/decompose-first.mjs']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  ok(rel + ' labels cost as denominator', /cost[_ ]?(note|denominator)/i.test(src));
}

// 5) loop-until-dry recipe has BOTH a dry-stop AND a hard agent ceiling (critic fix)
{
  const src = fs.readFileSync(path.join(ROOT, 'orchestration/recipes/divergent-explore.mjs'), 'utf8');
  ok('divergent-explore has hard ceiling', /HARD_AGENT_CEILING/.test(src) && /dryStreak/.test(src));
}

// 6) the A/B harness enforces the hook-exemption hard predecessor
{
  const src = fs.readFileSync(path.join(ROOT, 'eval/ab-harness.mjs'), 'utf8');
  ok('ab-harness gates on hookExemptionConfirmed', /hookExemptionConfirmed\s*!==\s*true/.test(src));
}

// 7) the seeded-defect fixture is valid JSON and stratified a/b/c
{
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/fixtures/seeded-defects.json'), 'utf8'));
  const strata = new Set();
  (fx.verify_tasks || []).forEach(t => (t.planted_defects || []).forEach(d => strata.add(d.stratum)));
  ok('fixture valid JSON + strata a/b/c present', ['a', 'b', 'c'].every(s => strata.has(s)), 'strata=' + [...strata]);
}

// 8) cross-model arm is OPT-IN and gated: the recipe only builds it when args.crossModel is set
{
  const src = fs.readFileSync(path.join(ROOT, 'orchestration/recipes/adversarial-verify.mjs'), 'utf8');
  ok('xverify arm is gated on crossModel', /xc\s*=\s*a\.crossModel/.test(src) && /crossEnabled\s*=\s*!!\(\s*xc/.test(src) && /if\s*\(crossEnabled\)/.test(src));
  ok('xverify default = no extra agents', /a\.crossModel/.test(src) && !/crossModel\s*=\s*\{/.test(src)); // never self-enables
  ok('cross verdicts excluded from the gate', /slice\(0,\s*lensKeys\.length\)/.test(src));
}

// 9) fusion server exposes fable_cross_verify and guards it (off-switch + key + artifact)
{
  const src = fs.readFileSync(path.join(ROOT, 'fusion/fusion-server.js'), 'utf8');
  ok('fable_cross_verify tool exists', /name:\s*'fable_cross_verify'/.test(src));
  ok('cross_verify honors FABLE_XVERIFY/FABLE_FUSION off', /FABLE_XVERIFY\s*===\s*'off'/.test(src) && /FABLE_FUSION\s*===\s*'off'/.test(src));
  ok('cross_verify requires a key + artifact', /OPENROUTER_API_KEY/.test(src) && /requires a non-empty "artifact"/.test(src));
}

// 10) installer offers cross-model option, defaults OFF
{
  const src = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  ok('installer has --with-xverify', /--with-xverify/.test(src));
  ok('installer defaults xverify OFF', /XVERIFY=off/.test(src));
  ok('installer writes xverify config', /xverify\.json|XVERIFY_CFG/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
